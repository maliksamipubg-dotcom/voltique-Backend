import PDFDocument from 'pdfkit'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { imageSize } from 'image-size'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LOGO_PATH = path.join(__dirname, '..', 'assets', 'logo.png')

// ---------------------------------------------------------------------------
// Brand palette & page constants (A4 portrait, premium blue + white theme)
// ---------------------------------------------------------------------------
const BRAND = {
    primary: '#2456E6',
    primaryDark: '#1A3FAE',
    accent: '#0EA5E9',
    ink: '#0B1424',
    muted: '#52607A',
    border: '#E2E8F0',
    white: '#FFFFFF',
    light: '#F4F6FA',
    lightBlue: '#EEF2FF',
    rowAlt: '#F8FAFF',
    line: '#E8EDF5',
    danger: '#EF4444',
    green: '#059669',
}

const PAGE = { width: 595.28, height: 841.89 }
const MARGIN = 36
const CONTENT_WIDTH = PAGE.width - MARGIN * 2
const BOTTOM_LIMIT = PAGE.height - 58

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const fmtPrice = (value) => {
    const n = Number(value) || 0
    return `Rs ${n.toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

const fmtDate = (ts) => {
    if (!ts) return '—'
    try {
        return new Date(ts).toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
        })
    } catch (err) {
        return '—'
    }
}

const buildStreetLine = (address) => {
    const parts = [
        address.street,
        address.area,
        address.town,
    ].filter((p) => p && String(p).trim())
    return parts.length ? parts.join(', ') : '—'
}

const buildInvoiceNumber = (order) => {
    const orderRef = order.orderId || String(order._id || '')
    const m = /^PH-(\d{8})-(\d{4})$/.exec(orderRef)
    return m ? `INV-${m[1]}-${m[2]}` : `INV-${orderRef}`
}

const fetchImageBuffer = async (url) => {
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
        if (!res.ok) return null
        const buffer = Buffer.from(await res.arrayBuffer())
        return buffer.length < 16 ? null : buffer
    } catch (err) {
        return null
    }
}

// ---------------------------------------------------------------------------
// Main invoice builder
// ---------------------------------------------------------------------------
const buildInvoice = (doc, order, itemImages) => {
    const items = Array.isArray(order.items) ? order.items : []
    const address = order.address || {}

    const subtotal = items.reduce(
        (sum, it) => sum + (Number(it.price) || 0) * (Number(it.quantity) || 1),
        0
    )
    const grandTotal = Number(order.amount) || subtotal
    const advancePayment = Number(order.advancePayment) || 0
    const remainingBalance = Math.max(0, grandTotal - advancePayment)
    const discount = Number(order.discount) || 0
    const tax = Number(order.tax) || 0
    const shipping = Number.isFinite(Number(order.shipping))
        ? Number(order.shipping)
        : Math.max(0, grandTotal - subtotal + discount - tax)

    const customerName = [address.firstName, address.lastName].filter(Boolean).join(' ') || '—'
    const invoiceNumber = buildInvoiceNumber(order)
    const paymentMethod = order.paymentMethod === 'COD' ? 'Cash On Delivery' : (order.paymentMethod || '—')
    const orderDate = order.date ? new Date(order.date) : null

    let y = 0
    let pageNo = 1

    const setFont = (weight, size) => {
        doc.font(weight === 'bold' ? 'Helvetica-Bold' : 'Helvetica')
        doc.fontSize(size)
        return doc
    }

    const drawPageFooter = () => {
        const fy = PAGE.height - 50
        doc.save()
        doc.strokeColor(BRAND.border).lineWidth(0.7)
        doc.moveTo(MARGIN, fy - 4).lineTo(PAGE.width - MARGIN, fy - 4).stroke()
        setFont('normal', 7)
        doc.fillColor(BRAND.muted)
        doc.text('Voltique Hub  •  voltiquehubsupport@gmail.com  •  03063720139', MARGIN, fy, {
            width: CONTENT_WIDTH - 80,
            lineBreak: false,
        })
        doc.text(`Page ${pageNo}`, MARGIN, fy, {
            width: CONTENT_WIDTH,
            align: 'right',
            lineBreak: false,
        })
        doc.restore()
    }

    const newPage = () => {
        doc.addPage()
        pageNo += 1
        drawPageFooter()
        return MARGIN
    }

    const ensureSpace = (needed) => {
        if (y + needed > BOTTOM_LIMIT) {
            y = newPage()
            return true
        }
        return false
    }

    // ------------------------------------------------------------------
    // Top gradient band
    // ------------------------------------------------------------------
    const band = doc.linearGradient(0, 0, PAGE.width, 0)
    band.stop(0, BRAND.primary).stop(1, BRAND.accent)
    doc.rect(0, 0, PAGE.width, 6).fill(band)

    // Footer for the first page (drawn before content, never overlaps it)
    drawPageFooter()

    // ------------------------------------------------------------------
    // Header: logo + brand name + tagline (left) | INVOICE (right)
    // ------------------------------------------------------------------
    y = 24

    let logo = null
    try {
        if (fs.existsSync(LOGO_PATH)) {
            const buffer = fs.readFileSync(LOGO_PATH)
            const dims = imageSize(buffer)
            logo = { buffer, width: dims.width, height: dims.height }
        }
    } catch (err) {
        logo = null
    }

    const logoH = 44
    let logoW = logoH
    if (logo && logo.buffer) {
        logoW = logo.width && logo.height ? (logoH * logo.width) / logo.height : logoH
        try {
            doc.image(logo.buffer, MARGIN, y, { width: logoW, height: logoH })
        } catch (err) {
            logo = null
        }
    }

    // Brand name + tagline, vertically centered beside the logo as one identity
    const brandX = MARGIN + (logo ? logoW + 12 : 0)
    const blockH = 28
    const brandTop = y + (logo ? (logoH - blockH) / 2 : 12)

    setFont('bold', 17)
    doc.fillColor(BRAND.ink)
    doc.text('Voltique Hub', brandX, brandTop, { lineBreak: false })
    setFont('normal', 8)
    doc.fillColor(BRAND.muted)
    doc.text('Battery Chargers & Power Solutions', brandX, brandTop + 20, { lineBreak: false })

    // Contact info under the logo
    const contactY = y + 50
    setFont('normal', 7.5)
    doc.fillColor(BRAND.muted)
    doc.text('voltiquehubsupport@gmail.com', MARGIN, contactY, { width: 175, lineBreak: false })
    doc.text('03063720139', MARGIN, contactY + 11, { width: 175, lineBreak: false })
    doc.text('Saddar, Karachi, Pakistan', MARGIN, contactY + 22, { width: 175, lineBreak: false })

    // Right: INVOICE title + invoice number badge + meta rows
    const rightX = PAGE.width - MARGIN - 190
    const rightW = 190

    setFont('bold', 25)
    doc.fillColor(BRAND.primary)
    doc.text('INVOICE', rightX, y - 2, {
        width: rightW,
        align: 'right',
        lineBreak: false,
        characterSpacing: 2,
    })

    // Invoice number badge
    setFont('bold', 9)
    const badgeW = doc.widthOfString(invoiceNumber) + 20
    const badgeX = rightX + rightW - badgeW
    const badgeY = y + 30
    doc.save()
    doc.roundedRect(badgeX, badgeY, badgeW, 16, 8).fill(BRAND.lightBlue)
    setFont('bold', 9)
    doc.fillColor(BRAND.primary)
    doc.text(invoiceNumber, badgeX, badgeY + 4, { width: badgeW, align: 'center', lineBreak: false })
    doc.restore()

    const drawMetaRow = (label, value, rowY) => {
        doc.save()
        setFont('bold', 7)
        doc.fillColor(BRAND.muted)
        doc.text(label.toUpperCase(), rightX, rowY, { width: 72, lineBreak: false, characterSpacing: 0.5 })
        setFont('normal', 9)
        doc.fillColor(BRAND.ink)
        doc.text(String(value), rightX + 74, rowY, { width: rightW - 74, align: 'right', lineBreak: false })
        doc.restore()
    }

    drawMetaRow('Invoice Date', orderDate ? fmtDate(order.date) : '—', badgeY + 22)
    drawMetaRow('Order ID', order.orderId || order._id || '—', badgeY + 37)
    drawMetaRow('Payment Method', paymentMethod, badgeY + 52)

    // Divider below header
    y = 152
    doc.strokeColor(BRAND.border).lineWidth(1)
    doc.moveTo(MARGIN, y).lineTo(PAGE.width - MARGIN, y).stroke()
    y += 16

    // ------------------------------------------------------------------
    // Customer details + shipping address cards
    // ------------------------------------------------------------------
    const cardGap = 14
    const cardW = (CONTENT_WIDTH - cardGap) / 2
    const streetLine = buildStreetLine(address)

    const leftRows = [
        ['Name', customerName],
        ['Phone', address.phone || '—'],
        ['Email', address.email || '—'],
    ]
    const rightRows = [
        ['Address', streetLine],
        ['City', address.city || '—'],
        ['State', address.state || '—'],
        ['Postal Code', address.zipcode || '—'],
        ['Country', address.country || '—'],
    ]

    const measureCard = (rows) => {
        setFont('normal', 9)
        let h = 34
        for (const [, value] of rows) {
            const valueW = cardW - 104
            h += Math.max(15, doc.heightOfString(String(value), { width: valueW, lineBreak: true }) + 3)
        }
        return h + 10
    }

    const cardH = Math.max(measureCard(leftRows), measureCard(rightRows), 110)

    const drawCard = (x, title, rows) => {
        doc.save()
        doc.fillColor(BRAND.white)
        doc.roundedRect(x, y, cardW, cardH, 8).fillAndStroke(BRAND.white, BRAND.border)
        doc.strokeColor(BRAND.border).lineWidth(0.8)

        setFont('bold', 8)
        doc.fillColor(BRAND.primary)
        doc.text(title.toUpperCase(), x + 14, y + 13, {
            width: cardW - 28,
            lineBreak: false,
            characterSpacing: 0.8,
        })

        let ry = y + 34
        for (const [label, value] of rows) {
            setFont('bold', 7.5)
            doc.fillColor(BRAND.muted)
            doc.text(label.toUpperCase(), x + 14, ry, { width: 82, lineBreak: false })
            setFont('normal', 9)
            doc.fillColor(BRAND.ink)
            doc.text(String(value), x + 98, ry, { width: cardW - 112, lineBreak: true })
            ry += Math.max(15, doc.heightOfString(String(value), { width: cardW - 112, lineBreak: true }) + 3)
        }
        doc.restore()
    }

    drawCard(MARGIN, 'Customer Details', leftRows)
    drawCard(MARGIN + cardW + cardGap, 'Shipping Address', rightRows)
    y += cardH + 20

    // ------------------------------------------------------------------
    // Order details table
    // ------------------------------------------------------------------
    setFont('bold', 12)
    doc.fillColor(BRAND.ink)
    doc.text('ORDER DETAILS', MARGIN, y, { lineBreak: false })
    doc.rect(MARGIN, y + 16, 36, 3).fill(BRAND.primary)
    y += 30

    const colX = [0, 52, 210, 274, 350, 384, 454].map((c) => MARGIN + c)
    const colW = [52, 158, 64, 76, 34, 70, 61]
    const headerH = 22
    const tableStartY = y

    const drawTableHeader = () => {
        doc.save()
        doc.fillColor(BRAND.primary)
        doc.roundedRect(MARGIN, y, CONTENT_WIDTH, headerH, 5).fill()
        doc.rect(MARGIN, y + headerH / 2, CONTENT_WIDTH, headerH / 2).fill()

        doc.fillColor(BRAND.white)
        setFont('bold', 7)

        const cells = [
            { label: 'Product Image', x: colX[0], w: colW[0], align: 'center' },
            { label: 'Product Name', x: colX[1], w: colW[1], align: 'left' },
            { label: 'Category', x: colX[2], w: colW[2], align: 'left' },
            { label: 'Variant', x: colX[3], w: colW[3], align: 'left' },
            { label: 'Qty', x: colX[4], w: colW[4], align: 'center' },
            { label: 'Unit Price', x: colX[5], w: colW[5], align: 'right' },
            { label: 'Subtotal', x: colX[6], w: colW[6], align: 'right' },
        ]

        for (const cell of cells) {
            doc.text(cell.label, cell.x + 3, y + 7, {
                width: cell.w - 6,
                align: cell.align,
                lineBreak: false,
            })
        }
        doc.restore()
        y += headerH
    }

    const drawItemPlaceholder = (ix, iy, iw, ih) => {
        doc.save()
        doc.fillColor(BRAND.light)
        doc.strokeColor(BRAND.line)
        doc.roundedRect(ix, iy, iw, ih, 4).fillAndStroke(BRAND.light, BRAND.line)
        setFont('normal', 5.5)
        doc.fillColor(BRAND.muted)
        doc.text('IMAGE', ix, iy + ih / 2 - 3, { width: iw, align: 'center', lineBreak: false })
        doc.restore()
    }

    const drawItemRow = (item, img, index) => {
        const name = String(item.name || '—')
        const nameW = colW[1] - 12
        setFont('normal', 8.5)
        const nameH = doc.heightOfString(name, { width: nameW, lineBreak: true, lineGap: 2 })
        const rowH = Math.max(46, nameH + 18)

        if (y + rowH > BOTTOM_LIMIT) {
            y = newPage()
            drawTableHeader()
        }

        const rowTop = y

        // Row background
        doc.fillColor(index % 2 === 0 ? BRAND.white : BRAND.rowAlt)
        doc.rect(MARGIN, rowTop, CONTENT_WIDTH, rowH).fill()

        // Product image
        const box = 40
        const ix = colX[0] + (colW[0] - box) / 2
        const iy = rowTop + (rowH - box) / 2

        if (img && img.buffer) {
            try {
                let dw = box
                let dh = box
                if (img.width && img.height) {
                    const scale = Math.min(box / img.width, box / img.height)
                    dw = Math.round(img.width * scale)
                    dh = Math.round(img.height * scale)
                }
                doc.save()
                doc.strokeColor(BRAND.border).lineWidth(0.6)
                doc.rect(ix, iy, box, box).stroke()
                doc.image(img.buffer, ix + (box - dw) / 2, iy + (box - dh) / 2, { width: dw, height: dh })
                doc.restore()
            } catch (err) {
                drawItemPlaceholder(ix, iy, box, box)
            }
        } else {
            drawItemPlaceholder(ix, iy, box, box)
        }

        // Product name (wrapped)
        setFont('normal', 8.5)
        doc.fillColor(BRAND.ink)
        doc.text(name, colX[1] + 6, rowTop + (rowH - nameH) / 2, { width: nameW, lineGap: 2 })

        // Category
        setFont('normal', 8.5)
        doc.fillColor(BRAND.muted)
        doc.text(String(item.category || '—'), colX[2] + 6, rowTop + (rowH - 10) / 2, {
            width: colW[2] - 12,
            lineBreak: false,
        })

        // Variant (Ampere / Model)
        const variant = String(item.size || 'Default')
        setFont('normal', 8.5)
        doc.fillColor(BRAND.muted)
        doc.text(variant, colX[3] + 6, rowTop + (rowH - 10) / 2, {
            width: colW[3] - 12,
            lineBreak: false,
        })

        // Quantity
        setFont('normal', 8.5)
        doc.fillColor(BRAND.ink)
        doc.text(String(item.quantity || 1), colX[4], rowTop + (rowH - 10) / 2, {
            width: colW[4],
            align: 'center',
            lineBreak: false,
        })

        // Unit price
        setFont('normal', 8.5)
        doc.fillColor(BRAND.ink)
        doc.text(fmtPrice(item.price), colX[5] + 6, rowTop + (rowH - 10) / 2, {
            width: colW[5] - 12,
            align: 'right',
            lineBreak: false,
        })

        // Subtotal
        const lineTotal = (Number(item.price) || 0) * (Number(item.quantity) || 1)
        setFont('bold', 8.5)
        doc.fillColor(BRAND.ink)
        doc.text(fmtPrice(lineTotal), colX[6] + 6, rowTop + (rowH - 10) / 2, {
            width: colW[6] - 12,
            align: 'right',
            lineBreak: false,
        })

        // Row bottom border
        doc.strokeColor(BRAND.border).lineWidth(0.6)
        doc.moveTo(MARGIN, rowTop + rowH).lineTo(PAGE.width - MARGIN, rowTop + rowH).stroke()

        y = rowTop + rowH
    }

    drawTableHeader()

    items.forEach((item, index) => {
        drawItemRow(item, itemImages[index], index)
    })

    const tableEndY = y

    // Vertical grid lines for the table
    if (tableEndY > tableStartY + headerH) {
        doc.save()
        doc.strokeColor(BRAND.line).lineWidth(0.5)
        for (let c = 1; c < colX.length; c++) {
            doc.moveTo(colX[c], tableStartY).lineTo(colX[c], tableEndY).stroke()
        }
        doc.strokeColor(BRAND.border).lineWidth(0.8)
        doc.moveTo(MARGIN, tableStartY).lineTo(MARGIN, tableEndY).stroke()
        doc.moveTo(PAGE.width - MARGIN, tableStartY).lineTo(PAGE.width - MARGIN, tableEndY).stroke()
        doc.restore()
    }

    y += 22

    // ------------------------------------------------------------------
    // Payment summary
    // ------------------------------------------------------------------
    ensureSpace(260)

    const sumW = 250
    const sumX = PAGE.width - MARGIN - sumW

    setFont('bold', 11)
    doc.fillColor(BRAND.ink)
    doc.text('PAYMENT SUMMARY', sumX, y, { lineBreak: false })
    doc.rect(sumX, y + 15, 36, 3).fill(BRAND.primary)
    y += 28

    const summaryRows = [
        ['Subtotal', fmtPrice(subtotal)],
        ['Shipping Charges', fmtPrice(shipping)],
    ]
    if (discount > 0) summaryRows.push(['Discount', `- ${fmtPrice(discount)}`])
    if (tax > 0) summaryRows.push(['Tax', fmtPrice(tax)])

    const sumRowH = 18
    for (const [label, value] of summaryRows) {
        setFont('normal', 9)
        doc.fillColor(BRAND.muted)
        doc.text(label, sumX, y, { width: sumW - 110, lineBreak: false })
        setFont('normal', 9)
        doc.fillColor(BRAND.ink)
        doc.text(value, sumX + 100, y, { width: sumW - 100, align: 'right', lineBreak: false })
        y += sumRowH
    }

    y += 2
    doc.strokeColor(BRAND.border).lineWidth(0.8)
    doc.moveTo(sumX, y).lineTo(sumX + sumW, y).stroke()
    y += 10

    // Grand total (highlighted)
    const gtH = 30
    doc.save()
    doc.roundedRect(sumX, y, sumW, gtH, 6).fill(BRAND.primary)
    setFont('bold', 10)
    doc.fillColor(BRAND.white)
    doc.text('GRAND TOTAL', sumX + 14, y + 10, { width: 130, lineBreak: false })
    doc.text(fmtPrice(grandTotal), sumX + 14, y + 10, { width: sumW - 28, align: 'right', lineBreak: false })
    doc.restore()
    y += gtH

    // Advance Payment (deducted from grand total; always shown, Rs 0 when none)
    y += 8
    setFont('normal', 9)
    doc.fillColor(BRAND.muted)
    doc.text('Advance Payment', sumX, y, { width: sumW - 110, lineBreak: false })
    setFont('normal', 9)
    doc.fillColor(BRAND.danger)
    doc.text(`- ${fmtPrice(advancePayment)}`, sumX + 100, y, { width: sumW - 100, align: 'right', lineBreak: false })
    y += 18

    // Remaining balance (highlighted)
    const rbH = 30
    doc.save()
    doc.roundedRect(sumX, y, sumW, rbH, 6).fill(BRAND.green)
    setFont('bold', 10)
    doc.fillColor(BRAND.white)
    doc.text('REMAINING BALANCE', sumX + 14, y + 10, { width: 180, lineBreak: false })
    doc.text(fmtPrice(remainingBalance), sumX + 14, y + 10, { width: sumW - 28, align: 'right', lineBreak: false })
    doc.restore()
    y += rbH

    // ------------------------------------------------------------------
    // Thank you footer
    // ------------------------------------------------------------------
    y += 26
    ensureSpace(90)

    doc.save()
    setFont('bold', 12)
    doc.fillColor(BRAND.ink)
    doc.text('Thank you for shopping with Voltique Hub.', MARGIN, y, { lineBreak: false })
    y += 22

    setFont('normal', 9)
    doc.fillColor(BRAND.muted)
    doc.text('For support, please contact us at:', MARGIN, y, { lineBreak: false })
    y += 14

    doc.fillColor(BRAND.primary)
    setFont('bold', 9)
    doc.text('voltiquehubsupport@gmail.com     |     03063720139', MARGIN, y, { lineBreak: false })
    y += 17

    setFont('normal', 9)
    doc.fillColor(BRAND.muted)
    doc.text('Website: Voltique Hub', MARGIN, y, { lineBreak: false })
    y += 20

    doc.fillColor(BRAND.muted)
    setFont('normal', 8.5)
    doc.text('This is a computer-generated invoice and does not require a signature.', MARGIN, y, {
        width: CONTENT_WIDTH,
        lineBreak: false,
    })
    doc.restore()
}

// ---------------------------------------------------------------------------
// Public API — fully build a print-ready A4 invoice PDF and return it as a
// binary Buffer. No temp files are written and nothing is streamed until the
// document is complete, so failures never leave a truncated/aborted response.
// ---------------------------------------------------------------------------
export const buildInvoicePdfBuffer = async (order) => {
    const items = Array.isArray(order.items) ? order.items : []

    const settled = await Promise.allSettled(
        items.map(async (item) => {
            const url = item.image && item.image[0]
            if (!url) return null
            const buffer = await fetchImageBuffer(url)
            if (!buffer) return null
            try {
                const dims = imageSize(buffer)
                return { buffer, width: dims.width, height: dims.height }
            } catch (err) {
                return { buffer, width: null, height: null }
            }
        })
    )
    const itemImages = settled.map((r) => (r.status === 'fulfilled' ? r.value : null))

    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({
            size: 'A4',
            layout: 'portrait',
            margin: MARGIN,
            autoFirstPage: true,
            info: {
                Title: `Invoice ${order.orderId || ''}`.trim(),
                Author: 'Voltique Hub',
                Subject: 'Order Invoice',
                Keywords: 'invoice, voltique hub, order',
                Creator: 'Voltique Hub',
                Producer: 'Voltique Hub',
            },
        })

        const chunks = []
        doc.on('data', (chunk) => chunks.push(chunk))
        doc.on('end', () => resolve(Buffer.concat(chunks)))
        doc.on('error', (err) => reject(err))

        try {
            buildInvoice(doc, order, itemImages)
            doc.end()
        } catch (err) {
            reject(err)
        }
    })
}
