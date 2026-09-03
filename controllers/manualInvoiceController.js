import manualInvoiceModel from "../models/manualInvoiceModel.js"
import { buildInvoicePdfBuffer } from "../utils/invoiceGenerator.js"

// Manual invoices reuse the exact same A4 invoice template that automatic
// customer-order invoices use (buildInvoicePdfBuffer). The only difference is
// that the data is entered manually by the admin instead of being read from a
// real order, so an "order-shaped" payload is reconstructed from the stored
// manual invoice before the shared generator runs. This keeps automatic order
// invoice generation untouched while producing visually identical PDFs.
const toInvoiceOrderShape = (invoice) => {
    const nameParts = (invoice.customer.name || '').trim().split(/\s+/)
    return {
        orderId: invoice.invoiceNumber,
        items: invoice.items,
        amount: invoice.grandTotal,
        discount: invoice.discount,
        advancePayment: invoice.advancePayment,
        tax: 0,
        shipping: invoice.shippingCharges || 0,
        paymentMethod: invoice.paymentMethod || 'COD',
        date: invoice.date,
        address: {
            firstName: nameParts[0] || '',
            lastName: nameParts.slice(1).join(' '),
            phone: invoice.customer.phone || '',
            email: invoice.customer.email || '',
            street: invoice.customer.address || '',
            area: '',
            town: '',
            city: invoice.customer.city || '',
            state: invoice.customer.state || '',
            zipcode: invoice.customer.postalCode || '',
            country: invoice.customer.country || '',
        },
    }
}

const generateInvoiceNumber = () => {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    return 'MINV-' + dateStr + '-' + String(Math.floor(Math.random() * 9000) + 1000)
}

// Create + save a manual invoice. Saving is kept separate from PDF generation
// so the stored document is always available for re-download/print later.
const createManualInvoice = async (req, res) => {
    try {
        const { customer, items, discount, advancePayment, notes, paymentMethod, shippingCharges } = req.body

        if (!customer || !customer.name || !customer.phone || !customer.address) {
            return res.json({ success: false, message: 'Customer name, phone number and address are required' })
        }
        if (!Array.isArray(items) || items.length === 0) {
            return res.json({ success: false, message: 'Select at least one product' })
        }

        const cleanItems = items
            .map((it) => ({
                productId: String(it.productId || ''),
                name: String(it.name || '').trim(),
                image: Array.isArray(it.image) ? it.image : it.image ? [it.image] : [],
                category: String(it.category || ''),
                size: String(it.size || 'Default'),
                originalPrice: Number(it.originalPrice) || 0,
                price: Number(it.price) || 0,
                quantity: Number(it.quantity) || 1,
            }))
            .filter((it) => it.name && it.price >= 0 && it.quantity > 0)

        if (cleanItems.length === 0) {
            return res.json({ success: false, message: 'Select at least one product with a valid price and quantity' })
        }

        const method = paymentMethod === 'Online Payment' ? 'Online Payment' : 'COD'
        const rawShipping = Number(shippingCharges)
        const shipping = Number.isFinite(rawShipping) && rawShipping > 0 ? rawShipping : 0

        const subtotal = cleanItems.reduce((sum, it) => sum + it.price * it.quantity, 0)
        const disc = Number(discount) || 0
        const adv = Number(advancePayment) || 0
        const grandTotal = Math.max(0, subtotal + shipping - disc)
        const remainingBalance = Math.max(0, grandTotal - adv)

        let invoiceNumber = generateInvoiceNumber()
        while (await manualInvoiceModel.findOne({ invoiceNumber })) {
            invoiceNumber = generateInvoiceNumber()
        }

        const invoice = new manualInvoiceModel({
            invoiceNumber,
            paymentMethod: method,
            shippingCharges: shipping,
            customer: {
                name: String(customer.name).trim(),
                phone: String(customer.phone).trim(),
                email: String(customer.email || '').trim(),
                address: String(customer.address).trim(),
                city: String(customer.city || '').trim(),
                state: String(customer.state || '').trim(),
                postalCode: String(customer.postalCode || '').trim(),
                country: String(customer.country || '').trim(),
            },
            items: cleanItems,
            subtotal,
            discount: disc,
            grandTotal,
            advancePayment: adv,
            remainingBalance,
            notes: String(notes || '').trim(),
            date: Date.now(),
        })
        await invoice.save()
        res.json({ success: true, message: 'Manual invoice generated and saved', invoice })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// All manual invoices for the history page, newest first.
const listManualInvoices = async (req, res) => {
    try {
        const invoices = await manualInvoiceModel.find({}).sort({ date: -1 })
        res.json({ success: true, invoices })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

const deleteManualInvoice = async (req, res) => {
    try {
        const { invoiceId } = req.body
        const invoice = await manualInvoiceModel.findById(invoiceId)
        if (!invoice) {
            return res.json({ success: false, message: 'Invoice not found' })
        }
        await manualInvoiceModel.findByIdAndDelete(invoiceId)
        res.json({ success: true, message: 'Invoice deleted successfully.' })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// Streams the identical A4 invoice PDF (built with the shared order invoice
// template) so the admin can download/print it again from the history page.
const downloadManualInvoicePdf = async (req, res) => {
    try {
        const { invoiceId } = req.body
        const invoice = await manualInvoiceModel.findById(invoiceId)
        if (!invoice) {
            return res.json({ success: false, message: 'Invoice not found' })
        }
        const pdfBuffer = await buildInvoicePdfBuffer(toInvoiceOrderShape(invoice), { omitEmptyAddressRows: true })
        const fileName = `Invoice-${invoice.invoiceNumber}.pdf`
        res.status(200)
        res.setHeader('Content-Type', 'application/pdf')
        res.setHeader('Content-Length', pdfBuffer.length)
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
        res.send(pdfBuffer)
    } catch (error) {
        console.log(error)
        if (!res.headersSent) {
            res.json({ success: false, message: error.message })
        }
    }
}

const updateManualInvoice = async (req, res) => {
    try {
        const { invoiceId, customer, items, discount, advancePayment, notes, paymentMethod, shippingCharges } = req.body

        if (!invoiceId) {
            return res.json({ success: false, message: 'Invoice ID is required' })
        }

        const invoice = await manualInvoiceModel.findById(invoiceId)
        if (!invoice) {
            return res.json({ success: false, message: 'Invoice not found' })
        }

        if (!customer || !customer.name || !customer.phone || !customer.address) {
            return res.json({ success: false, message: 'Customer name, phone number and address are required' })
        }
        if (!Array.isArray(items) || items.length === 0) {
            return res.json({ success: false, message: 'Select at least one product' })
        }

        const cleanItems = items
            .map((it) => ({
                productId: String(it.productId || ''),
                name: String(it.name || '').trim(),
                image: Array.isArray(it.image) ? it.image : it.image ? [it.image] : [],
                category: String(it.category || ''),
                size: String(it.size || 'Default'),
                originalPrice: Number(it.originalPrice) || 0,
                price: Number(it.price) || 0,
                quantity: Number(it.quantity) || 1,
            }))
            .filter((it) => it.name && it.price >= 0 && it.quantity > 0)

        if (cleanItems.length === 0) {
            return res.json({ success: false, message: 'Select at least one product with a valid price and quantity' })
        }

        const method = paymentMethod === 'Online Payment' ? 'Online Payment' : 'COD'
        const rawShipping = Number(shippingCharges)
        const shipping = Number.isFinite(rawShipping) && rawShipping > 0 ? rawShipping : 0

        const subtotal = cleanItems.reduce((sum, it) => sum + it.price * it.quantity, 0)
        const disc = Number(discount) || 0
        const adv = Number(advancePayment) || 0
        const grandTotal = Math.max(0, subtotal + shipping - disc)
        const remainingBalance = Math.max(0, grandTotal - adv)

        invoice.customer = {
            name: String(customer.name).trim(),
            phone: String(customer.phone).trim(),
            email: String(customer.email || '').trim(),
            address: String(customer.address).trim(),
            city: String(customer.city || '').trim(),
            state: String(customer.state || '').trim(),
            postalCode: String(customer.postalCode || '').trim(),
            country: String(customer.country || '').trim(),
        }
        invoice.items = cleanItems
        invoice.subtotal = subtotal
        invoice.discount = disc
        invoice.grandTotal = grandTotal
        invoice.advancePayment = adv
        invoice.remainingBalance = remainingBalance
        invoice.paymentMethod = method
        invoice.shippingCharges = shipping
        invoice.notes = String(notes || '').trim()

        await invoice.save()
        res.json({ success: true, message: 'Invoice updated successfully', invoice })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

export { createManualInvoice, listManualInvoices, deleteManualInvoice, downloadManualInvoicePdf, updateManualInvoice }
