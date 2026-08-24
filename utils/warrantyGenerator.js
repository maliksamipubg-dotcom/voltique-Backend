import PDFDocument from 'pdfkit'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { imageSize } from 'image-size'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LOGO_PATH = path.join(__dirname, '..', 'assets', 'logo.png')

// ---------------------------------------------------------------------------
// Brand palette & page constants — identical premium branding to the invoice
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
    dangerLight: '#FEF2F2',
    green: '#059669',
    greenLight: '#ECFDF5',
}

const PAGE = { width: 595.28, height: 841.89 }
const MARGIN = 36
const CONTENT_WIDTH = PAGE.width - MARGIN * 2

const STORE = {
    name: 'Voltique Hub',
    tagline: 'Battery Chargers & Power Solutions',
    phone: '03063720139',
    email: 'voltiquehubsupport@gmail.com',
    address: 'Shop No. 65, Iqbal Market, Soldier Bazaar, Karachi',
}

// "24 August 2026"
const fmtDateLong = (ts) => {
    if (!ts) return '—'
    try {
        return new Date(ts).toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
        })
    } catch (err) {
        return '—'
    }
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
// Single warranty card page (A4 portrait)
// ---------------------------------------------------------------------------
const buildWarrantyCardPage = (doc, card, productImage) => {
    const customer = card.customer || {}
    const product = card.product || {}
    const warranty = card.warranty || {}
    const coverage = card.coverage || {}

    let y = 0

    const setFont = (weight, size) => {
        doc.font(weight === 'bold' ? 'Helvetica-Bold' : 'Helvetica')
        doc.fontSize(size)
        return doc
    }

    // ------------------------------------------------------------------
    // Top gradient band + footer strip (drawn first so content never overlaps)
    // ------------------------------------------------------------------
    const band = doc.linearGradient(0, 0, PAGE.width, 0)
    band.stop(0, BRAND.primary).stop(1, BRAND.accent)
    doc.rect(0, 0, PAGE.width, 6).fill(band)

    const fy = PAGE.height - 50
    doc.save()
    doc.strokeColor(BRAND.border).lineWidth(0.7)
    doc.moveTo(MARGIN, fy - 4).lineTo(PAGE.width - MARGIN, fy - 4).stroke()
    setFont('normal', 7)
    doc.fillColor(BRAND.muted)
    doc.text(`${STORE.name}  •  ${STORE.email}  •  ${STORE.phone}`, MARGIN, fy, { lineBreak: false })
    doc.text('Warranty Card', MARGIN, fy, { width: CONTENT_WIDTH, align: 'right', lineBreak: false })
    doc.restore()

    // ------------------------------------------------------------------
    // Header: logo + brand identity (left) | WARRANTY CARD (right)
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

    const brandX = MARGIN + (logo ? logoW + 12 : 0)
    const blockH = 28
    const brandTop = y + (logo ? (logoH - blockH) / 2 : 12)

    setFont('bold', 17)
    doc.fillColor(BRAND.ink)
    doc.text(STORE.name, brandX, brandTop, { lineBreak: false })
    setFont('normal', 8)
    doc.fillColor(BRAND.muted)
    doc.text(STORE.tagline, brandX, brandTop + 20, { lineBreak: false })

    // Store contact block under the logo
    const contactY = y + 50
    setFont('normal', 7.5)
    doc.fillColor(BRAND.muted)
    doc.text(`Phone: ${STORE.phone}`, MARGIN, contactY, { width: 200, lineBreak: false })
    doc.text(`Email: ${STORE.email}`, MARGIN, contactY + 11, { width: 220, lineBreak: false })
    doc.text(`Address: ${STORE.address}`, MARGIN, contactY + 22, { width: CONTENT_WIDTH - 210, lineBreak: false })

    // Right: title + warranty card number badge + meta rows
    const rightX = PAGE.width - MARGIN - 190
    const rightW = 190

    setFont('bold', 20)
    doc.fillColor(BRAND.primary)
    doc.text('WARRANTY CARD', rightX, y + 2, {
        width: rightW,
        align: 'right',
        lineBreak: false,
        characterSpacing: 1,
    })

    // Card number badge
    setFont('bold', 9)
    const badgeW = doc.widthOfString(card.cardNumber) + 20
    const badgeX = rightX + rightW - badgeW
    const badgeY = y + 28
    doc.save()
    doc.roundedRect(badgeX, badgeY, badgeW, 16, 8).fill(BRAND.lightBlue)
    setFont('bold', 9)
    doc.fillColor(BRAND.primary)
    doc.text(card.cardNumber, badgeX, badgeY + 4, { width: badgeW, align: 'center', lineBreak: false })
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

    drawMetaRow('Issue Date', fmtDateLong(card.date), badgeY + 22)
    if (card.orderNumber) {
        drawMetaRow('Order No', card.orderNumber, badgeY + 37)
        drawMetaRow('Source', card.source || '—', badgeY + 52)
    } else {
        drawMetaRow('Source', card.source || 'Manual', badgeY + 37)
    }

    // Divider below header
    y = Math.max(contactY + 36, badgeY + (card.orderNumber ? 68 : 53))
    doc.strokeColor(BRAND.border).lineWidth(1)
    doc.moveTo(MARGIN, y).lineTo(PAGE.width - MARGIN, y).stroke()
    y += 16

    // ------------------------------------------------------------------
    // Customer details + address cards
    // ------------------------------------------------------------------
    const cardGap = 14
    const halfW = (CONTENT_WIDTH - cardGap) / 2

    const leftRows = [
        ['Name', customer.name],
        ['Phone', customer.phone],
        ['Email', customer.email],
    ].map(([l, v]) => [l, v ? String(v).trim() : '—'])

    const rightRows = [
        ['Address', customer.address],
        ['City', customer.city],
        ['State', customer.state],
        ['Postal Code', customer.postalCode],
        ['Country', customer.country],
    ]
        .map(([l, v]) => [l, v ? String(v).trim() : '—'])
        .filter((row) => row[1] !== '')

    const measureCard = (rows) => {
        setFont('normal', 9)
        let h = 34
        for (const [, value] of rows) {
            h += Math.max(15, doc.heightOfString(String(value), { width: halfW - 104, lineBreak: true }) + 3)
        }
        return h + 10
    }

    const infoCardH = Math.max(measureCard(leftRows), measureCard(rightRows), 96)

    const drawInfoCard = (x, title, rows) => {
        doc.save()
        doc.roundedRect(x, y, halfW, infoCardH, 8).fillAndStroke(BRAND.white, BRAND.border)

        setFont('bold', 8)
        doc.fillColor(BRAND.primary)
        doc.text(title.toUpperCase(), x + 14, y + 13, { width: halfW - 28, lineBreak: false, characterSpacing: 0.8 })

        let ry = y + 34
        for (const [label, value] of rows) {
            setFont('bold', 7.5)
            doc.fillColor(BRAND.muted)
            doc.text(label.toUpperCase(), x + 14, ry, { width: 82, lineBreak: false })
            setFont('normal', 9)
            doc.fillColor(BRAND.ink)
            doc.text(String(value), x + 98, ry, { width: halfW - 112, lineBreak: true })
            ry += Math.max(15, doc.heightOfString(String(value), { width: halfW - 112, lineBreak: true }) + 3)
        }
        doc.restore()
    }

    drawInfoCard(MARGIN, 'Customer Details', leftRows)
    drawInfoCard(MARGIN + halfW + cardGap, 'Address', rightRows)
    y += infoCardH + 20

    // ------------------------------------------------------------------
    // Product details section with image
    // ------------------------------------------------------------------
    setFont('bold', 12)
    doc.fillColor(BRAND.ink)
    doc.text('PRODUCT DETAILS', MARGIN, y, { lineBreak: false })
    doc.rect(MARGIN, y + 16, 36, 3).fill(BRAND.primary)
    y += 30

    const prodCardH = 118
    doc.save()
    doc.roundedRect(MARGIN, y, CONTENT_WIDTH, prodCardH, 8).fillAndStroke(BRAND.white, BRAND.border)

    // Product image box on the left
    const imgBox = 94
    const imgX = MARGIN + 14
    const imgY = y + (prodCardH - imgBox) / 2

    if (productImage && productImage.buffer) {
        try {
            let dw = imgBox
            let dh = imgBox
            if (productImage.width && productImage.height) {
                const scale = Math.min(imgBox / productImage.width, imgBox / productImage.height)
                dw = Math.round(productImage.width * scale)
                dh = Math.round(productImage.height * scale)
            }
            doc.save()
            doc.strokeColor(BRAND.border).lineWidth(0.7)
            doc.roundedRect(imgX, imgY, imgBox, imgBox, 5).stroke()
            doc.image(productImage.buffer, imgX + (imgBox - dw) / 2, imgY + (imgBox - dh) / 2, {
                width: dw,
                height: dh,
            })
            doc.restore()
        } catch (err) {
            doc.save()
            doc.strokeColor(BRAND.border).lineWidth(0.7)
            doc.roundedRect(imgX, imgY, imgBox, imgBox, 5).stroke()
            doc.restore()
        }
    } else {
        doc.save()
        doc.fillColor(BRAND.light)
        doc.strokeColor(BRAND.line)
        doc.roundedRect(imgX, imgY, imgBox, imgBox, 5).fillAndStroke(BRAND.light, BRAND.line)
        setFont('normal', 6.5)
        doc.fillColor(BRAND.muted)
        doc.text('IMAGE', imgX, imgY + imgBox / 2 - 3, { width: imgBox, align: 'center', lineBreak: false })
        doc.restore()
    }

    // Product detail rows on the right
    const prodRowsX = imgX + imgBox + 18
    const prodRowsW = PAGE.width - MARGIN - 14 - prodRowsX

    const productName = String(product.name || '—')
    setFont('bold', 11)
    doc.fillColor(BRAND.ink)
    doc.text(productName, prodRowsX, y + 14, { width: prodRowsW, lineBreak: true })
    const nameUsedH = Math.max(15, doc.heightOfString(productName, { width: prodRowsW, lineBreak: true }))

    const prodMeta = []
    prodMeta.push(['Model / Variant', product.model || 'Default'])
    if (product.category) prodMeta.push(['Category', product.category])
    prodMeta.push(['Quantity', String(Number(product.quantity) || 1)])
    if (card.orderNumber) prodMeta.push(['Order Number', card.orderNumber])

    let py = y + 14 + nameUsedH + 10
    for (const [label, value] of prodMeta) {
        setFont('bold', 7.5)
        doc.fillColor(BRAND.muted)
        doc.text(label.toUpperCase(), prodRowsX, py, { width: 110, lineBreak: false, characterSpacing: 0.5 })
        setFont('normal', 9)
        doc.fillColor(BRAND.ink)
        doc.text(String(value), prodRowsX + 114, py, { width: prodRowsW - 114, align: 'right', lineBreak: false })
        py += 16
    }
    doc.restore()

    y += prodCardH + 20

    // ------------------------------------------------------------------
    // Warranty summary band: period | start | expiry
    // ------------------------------------------------------------------
    const gap = 12
    const boxW = (CONTENT_WIDTH - gap * 2) / 3
    const boxH = 58

    const summaryBoxes = warranty.hasWarranty
        ? [
              { label: 'Warranty Period', value: warranty.periodLabel || '—' },
              { label: 'Warranty Start Date', value: fmtDateLong(card.startDate) },
              { label: 'Warranty Expiry Date', value: fmtDateLong(card.expiryDate) },
          ]
        : [{ label: 'Warranty', value: 'No Warranty' }]

    if (warranty.hasWarranty) {
        summaryBoxes.forEach((box, i) => {
            const bx = MARGIN + i * (boxW + gap)
            doc.save()
            doc.roundedRect(bx, y, boxW, boxH, 8).fill(BRAND.lightBlue)
            setFont('bold', 7)
            doc.fillColor(BRAND.primaryDark)
            doc.text(box.label.toUpperCase(), bx + 12, y + 11, {
                width: boxW - 24,
                lineBreak: false,
                characterSpacing: 0.6,
            })
            setFont('bold', 11)
            doc.fillColor(BRAND.primary)
            doc.text(box.value, bx + 12, y + 27, { width: boxW - 24, lineBreak: true })
            doc.restore()
        })
    } else {
        const noW = CONTENT_WIDTH
        doc.save()
        doc.roundedRect(MARGIN, y, noW, boxH, 8).fill(BRAND.light)
        setFont('bold', 9)
        doc.fillColor(BRAND.danger)
        doc.text('NO WARRANTY', MARGIN + 14, y + 12, { width: noW - 28, lineBreak: false, characterSpacing: 1 })
        setFont('normal', 8.5)
        doc.fillColor(BRAND.muted)
        doc.text(
            'This product was sold without any warranty coverage. No warranty period applies to this card.',
            MARGIN + 14,
            y + 30,
            { width: noW - 28, lineBreak: false }
        )
        doc.restore()
    }

    y += boxH + 20

    // ------------------------------------------------------------------
    // Warranty coverage: covers vs not covered
    // ------------------------------------------------------------------
    setFont('bold', 12)
    doc.fillColor(BRAND.ink)
    doc.text('WARRANTY COVERAGE', MARGIN, y, { lineBreak: false })
    doc.rect(MARGIN, y + 16, 36, 3).fill(BRAND.primary)
    y += 30

    const colW = (CONTENT_WIDTH - gap) / 2
    const coversList = Array.isArray(coverage.covers) && coverage.covers.length > 0 ? coverage.covers : []
    const excludesList = Array.isArray(coverage.excludes) && coverage.excludes.length > 0 ? coverage.excludes : []

    const measureCoverage = (items) => {
        setFont('normal', 8.5)
        let h = 30
        for (const item of items) {
            h += Math.max(14, doc.heightOfString(String(item), { width: colW - 40, lineBreak: true })) + 3
        }
        return h
    }
    const covH = Math.max(measureCoverage(coversList), measureCoverage(excludesList), 60)

    const drawCoverageCard = (x, title, items, tone) => {
        const isGreen = tone === 'green'
        doc.save()
        doc.roundedRect(x, y, colW, covH, 8).fill(isGreen ? BRAND.greenLight : BRAND.dangerLight)
        doc.strokeColor(isGreen ? BRAND.green : BRAND.danger).lineWidth(0.8)
        doc.roundedRect(x, y, colW, covH, 8).stroke()

        setFont('bold', 8)
        doc.fillColor(isGreen ? BRAND.green : BRAND.danger)
        doc.text(title.toUpperCase(), x + 12, y + 11, { width: colW - 24, lineBreak: false, characterSpacing: 0.6 })

        let ry = y + 30
        for (const item of items) {
            setFont('bold', 9)
            doc.fillColor(isGreen ? BRAND.green : BRAND.danger)
            doc.text(isGreen ? '+' : '\u00D7', x + 12, ry, { width: 12, lineBreak: false })
            setFont('normal', 8.5)
            doc.fillColor(BRAND.ink)
            doc.text(String(item), x + 26, ry, { width: colW - 40, lineBreak: true })
            ry += Math.max(14, doc.heightOfString(String(item), { width: colW - 40, lineBreak: true })) + 3
        }
        doc.restore()
    }

    drawCoverageCard(MARGIN, 'Warranty Covers', coversList, 'green')
    drawCoverageCard(MARGIN + colW + gap, 'Does Not Cover', excludesList, 'red')
    y += covH + 20

    // ------------------------------------------------------------------
    // Terms & conditions
    // ------------------------------------------------------------------
    const termsText = String(card.terms || '').trim()
    if (termsText) {
        setFont('bold', 12)
        doc.fillColor(BRAND.ink)
        doc.text('TERMS & CONDITIONS', MARGIN, y, { lineBreak: false })
        doc.rect(MARGIN, y + 16, 36, 3).fill(BRAND.primary)
        y += 30

        doc.save()
        setFont('normal', 8.5)
        doc.fillColor(BRAND.muted)
        const termLines = termsText.split(/\n+/).map((t) => t.replace(/^\s*\d+[.)]\s*/, '').trim()).filter(Boolean)
        termLines.forEach((line, i) => {
            doc.text(`${i + 1}. ${line}`, MARGIN, y, { width: CONTENT_WIDTH, lineGap: 3 })
            y += doc.heightOfString(`${i + 1}. ${line}`, { width: CONTENT_WIDTH, lineGap: 3 }) + 4
        })
        doc.restore()
        y += 10
    }

    // ------------------------------------------------------------------
    // Signature area
    // ------------------------------------------------------------------
    const sigLimit = PAGE.height - 78
    if (y < sigLimit - 46) {
        const sigX = PAGE.width - MARGIN - 180
        doc.save()
        doc.strokeColor(BRAND.muted).lineWidth(0.8)
        doc.moveTo(sigX, sigLimit).lineTo(PAGE.width - MARGIN, sigLimit).stroke()
        setFont('normal', 8)
        doc.fillColor(BRAND.muted)
        doc.text('Authorised Signature', sigX, sigLimit + 5, { width: 180, align: 'center', lineBreak: false })
        doc.text(STORE.name, sigX, sigLimit + 15, { width: 180, align: 'center', lineBreak: false })
        doc.restore()

        doc.save()
        setFont('normal', 8)
        doc.fillColor(BRAND.muted)
        doc.text('This is a computer-generated warranty card and does not require a physical stamp.', MARGIN, sigLimit + 5, {
            width: CONTENT_WIDTH - 200,
            lineBreak: true,
        })
        doc.restore()
    }
}

// ---------------------------------------------------------------------------
// Public API — builds one A4 page per warranty card and returns the PDF as a
// binary Buffer. Nothing is streamed until the document is complete.
// ---------------------------------------------------------------------------
export const buildWarrantyPdfBuffer = async (cards) => {
    const list = Array.isArray(cards) ? cards : [cards]
    if (list.length === 0) throw new Error('No warranty cards to generate')

    const settled = await Promise.allSettled(
        list.map(async (card) => {
            const url = card.product && card.product.image && card.product.image[0]
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
    const images = settled.map((r) => (r.status === 'fulfilled' ? r.value : null))

    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({
            size: 'A4',
            layout: 'portrait',
            margin: MARGIN,
            autoFirstPage: true,
            info: {
                Title: `Warranty Card ${list[0].cardNumber || ''}`.trim(),
                Author: STORE.name,
                Subject: 'Product Warranty Card',
                Keywords: 'warranty, voltique hub',
                Creator: STORE.name,
                Producer: STORE.name,
            },
        })

        const chunks = []
        doc.on('data', (chunk) => chunks.push(chunk))
        doc.on('end', () => resolve(Buffer.concat(chunks)))
        doc.on('error', (err) => reject(err))

        try {
            list.forEach((card, index) => {
                if (index > 0) doc.addPage()
                buildWarrantyCardPage(doc, card, images[index])
            })
            doc.end()
        } catch (err) {
            reject(err)
        }
    })
}
