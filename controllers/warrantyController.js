import warrantyCardModel, { nextWarrantyCardNumber } from "../models/warrantyCardModel.js"
import orderModel from "../models/orderModel.js"
import productModel from "../models/productModel.js"
import { buildWarrantyPdfBuffer } from "../utils/warrantyGenerator.js"
import {
    resolveProductWarranty,
    addMonthsToDate,
    parseWarrantyMonths,
    DEFAULT_COVERS,
    DEFAULT_EXCLUDES,
    DEFAULT_TERMS,
} from "../utils/warrantyHelper.js"

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const sendPdfBuffer = (res, pdfBuffer, fileName) => {
    res.status(200)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Length', pdfBuffer.length)
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
    res.send(pdfBuffer)
}

const sanitizeCoverageList = (value) =>
    Array.isArray(value)
        ? value.map((v) => String(v).trim()).filter(Boolean).slice(0, 20)
        : null

const buildCustomerFromOrderAddress = (address) => ({
    name: [address.firstName, address.lastName].filter(Boolean).join(' ').trim() || 'Customer',
    phone: address.phone || '',
    email: address.email || '',
    address: [address.street, address.area, address.town].filter((p) => p && String(p).trim()).join(', '),
    city: address.city || '',
    state: address.state || '',
    postalCode: address.zipcode || '',
    country: address.country || '',
})

// ---------------------------------------------------------------------------
// Automatic warranty generation for store orders
// ---------------------------------------------------------------------------

// Creates one stored warranty card per eligible (warranted) order item.
// Idempotent: items that already have an automatic card for this order are
// skipped, so refreshing/editing/viewing the order never creates duplicates.
export const generateWarrantyCardsForOrder = async (order) => {
    try {
        const freshOrder = typeof order === 'string' ? await orderModel.findById(order) : order
        if (!freshOrder) return []
        if (freshOrder.status === 'Cancelled') return []

        const existing = await warrantyCardModel.find({ orderId: String(freshOrder._id), source: 'Automatic Order' }).lean()
        const existingKeys = new Set(
            existing.map((c) => `${c.product?.productId || ''}|${c.product?.model || ''}`)
        )

        const items = Array.isArray(freshOrder.items) ? freshOrder.items : []
        const customer = buildCustomerFromOrderAddress(freshOrder.address || {})
        const created = []

        for (const item of items) {
            const productId = item._id ? String(item._id) : item.productId ? String(item.productId) : ''
            const model = String(item.size || 'Default')

            // Warranty always comes from the product's own warranty data.
            let productDoc = null
            if (productId) {
                try {
                    productDoc = await productModel.findById(productId).lean()
                } catch (err) {
                    productDoc = null
                }
            }
            const warrantySource = productDoc
                ? { warranty: productDoc.warranty, description: productDoc.description }
                : { warranty: item.warranty, description: item.description }
            const warrantyInfo = resolveProductWarranty(warrantySource)

            // Products without any warranty are handled as "No Warranty" and do
            // not get a warranty card generated automatically.
            if (!warrantyInfo.hasWarranty) continue

            const dedupeKey = `${productId}|${model}`
            if (existingKeys.has(dedupeKey)) continue

            const card = new warrantyCardModel({
                cardNumber: await nextWarrantyCardNumber(),
                source: 'Automatic Order',
                orderId: String(freshOrder._id),
                orderNumber: freshOrder.orderId || '',
                customer,
                product: {
                    productId,
                    name: item.name || (productDoc && productDoc.name) || 'Product',
                    image: Array.isArray(item.image) ? item.image : [],
                    model,
                    category: item.category || (productDoc && productDoc.category) || '',
                    quantity: Number(item.quantity) || 1,
                },
                warranty: {
                    hasWarranty: true,
                    periodLabel: warrantyInfo.periodLabel,
                    periodMonths: warrantyInfo.periodMonths,
                },
                // For store orders the purchase date is the warranty start date.
                startDate: Number(freshOrder.date) || Date.now(),
                expiryDate: addMonthsToDate(Number(freshOrder.date) || Date.now(), warrantyInfo.periodMonths),
                coverage: { covers: [...DEFAULT_COVERS], excludes: [...DEFAULT_EXCLUDES] },
                terms: DEFAULT_TERMS,
                notes: '',
                date: Date.now(),
            })
            await card.save()
            created.push(card)
        }

        return created
    } catch (error) {
        // Never let warranty generation break the order flow.
        console.log('Automatic warranty card generation failed:', error.message)
        return []
    }
}

// Ensures cards exist for an order (lazy backfill for orders placed before the
// feature existed or whose initial generation failed), then returns all of them.
const getOrderWarrantyCards = async (req, res) => {
    try {
        const { orderId } = req.body
        const order = await orderModel.findById(orderId)
        if (!order) {
            return res.json({ success: false, message: 'Order not found' })
        }
        await generateWarrantyCardsForOrder(order)
        const cards = await warrantyCardModel.find({ orderId: String(order._id) }).sort({ date: 1 })
        res.json({ success: true, cards })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// Combined multi-page PDF download straight from an order (admin convenience).
const downloadOrderWarrantyPdf = async (req, res) => {
    try {
        const { orderId } = req.body
        const order = await orderModel.findById(orderId)
        if (!order) {
            return res.json({ success: false, message: 'Order not found' })
        }
        await generateWarrantyCardsForOrder(order)
        const cards = await warrantyCardModel.find({ orderId: String(order._id) }).sort({ date: 1 })
        if (cards.length === 0) {
            return res.json({
                success: false,
                message: 'No warranty cards available for this order — none of its products have a warranty.',
            })
        }
        const pdfBuffer = await buildWarrantyPdfBuffer(cards)
        sendPdfBuffer(res, pdfBuffer, `Warranty-Cards-${order.orderId || order._id}.pdf`)
    } catch (error) {
        console.log(error)
        if (!res.headersSent) {
            res.json({ success: false, message: error.message })
        }
    }
}

// ---------------------------------------------------------------------------
// Manual warranty cards (Admin Panel)
// ---------------------------------------------------------------------------

const createManualWarranty = async (req, res) => {
    try {
        const { customer, product, warrantyPeriod, customExpiryDate, startDate, coverage, terms, notes } = req.body

        if (!customer || !customer.name || !customer.phone) {
            return res.json({ success: false, message: 'Customer name and phone number are required' })
        }
        if (!product || !String(product.name || '').trim()) {
            return res.json({ success: false, message: 'Select a product' })
        }
        const startTs = Number(startDate)
        if (!Number.isFinite(startTs)) {
            return res.json({ success: false, message: 'A valid warranty start date is required' })
        }

        // The warranty period loads automatically from the selected product;
        // the admin may override it manually before generating.
        let periodLabel = String(warrantyPeriod || '').trim()
        let periodMonths = periodLabel ? parseWarrantyMonths(periodLabel) : null

        // When no override was provided, resolve straight from the product data.
        if (!periodLabel && product.productId) {
            let productDoc = null
            try {
                productDoc = await productModel.findById(String(product.productId)).lean()
            } catch (err) {
                productDoc = null
            }
            const resolved = resolveProductWarranty(productDoc || {})
            periodLabel = resolved.periodLabel
            periodMonths = resolved.hasWarranty ? resolved.periodMonths : null
        }

        const hasWarranty = Boolean(periodLabel && periodLabel !== 'No Warranty' && periodMonths)

        let expiryTs = null
        if (hasWarranty) {
            const custom = Number(customExpiryDate)
            expiryTs = Number.isFinite(custom) && custom > 0 ? custom : addMonthsToDate(startTs, periodMonths)
        }

        const card = new warrantyCardModel({
            cardNumber: await nextWarrantyCardNumber(),
            source: 'Manual',
            orderId: '',
            orderNumber: String(req.body.orderNumber || '').trim(),
            customer: {
                name: String(customer.name).trim(),
                phone: String(customer.phone).trim(),
                email: String(customer.email || '').trim(),
                address: String(customer.address || '').trim(),
                city: String(customer.city || '').trim(),
                state: String(customer.state || '').trim(),
                postalCode: String(customer.postalCode || '').trim(),
                country: String(customer.country || '').trim(),
            },
            product: {
                productId: String(product.productId || ''),
                name: String(product.name).trim(),
                image: Array.isArray(product.image) ? product.image : product.image ? [product.image] : [],
                model: String(product.model || 'Default'),
                category: String(product.category || ''),
                quantity: Number(product.quantity) || 1,
            },
            warranty: {
                hasWarranty,
                periodLabel: hasWarranty ? periodLabel : 'No Warranty',
                periodMonths: hasWarranty ? periodMonths : null,
            },
            startDate: startTs,
            expiryDate: expiryTs,
            coverage: {
                covers: sanitizeCoverageList(coverage && coverage.covers) || [...DEFAULT_COVERS],
                excludes: sanitizeCoverageList(coverage && coverage.excludes) || [...DEFAULT_EXCLUDES],
            },
            terms: String(terms != null && terms.trim() !== '' ? terms : DEFAULT_TERMS),
            notes: String(notes || '').trim(),
            date: Date.now(),
        })
        await card.save()
        res.json({ success: true, message: 'Warranty card generated and saved', card })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// All warranty cards for the history page, newest first.
const listWarrantyCards = async (req, res) => {
    try {
        const cards = await warrantyCardModel.find({}).sort({ date: -1 })
        res.json({ success: true, cards })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

const deleteWarrantyCard = async (req, res) => {
    try {
        const { cardId } = req.body
        const card = await warrantyCardModel.findById(cardId)
        if (!card) {
            return res.json({ success: false, message: 'Warranty card not found' })
        }
        await warrantyCardModel.findByIdAndDelete(cardId)
        res.json({ success: true, message: 'Warranty card deleted successfully.' })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// Streams the stored warranty card as a print-ready PDF.
const downloadWarrantyPdf = async (req, res) => {
    try {
        const { cardId } = req.body
        const card = await warrantyCardModel.findById(cardId)
        if (!card) {
            return res.json({ success: false, message: 'Warranty card not found' })
        }
        const pdfBuffer = await buildWarrantyPdfBuffer(card)
        sendPdfBuffer(res, pdfBuffer, `Warranty-${card.cardNumber}.pdf`)
    } catch (error) {
        console.log(error)
        if (!res.headersSent) {
            res.json({ success: false, message: error.message })
        }
    }
}

export { createManualWarranty, listWarrantyCards, deleteWarrantyCard, downloadWarrantyPdf, getOrderWarrantyCards, downloadOrderWarrantyPdf }
