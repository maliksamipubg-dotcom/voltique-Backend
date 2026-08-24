// ---------------------------------------------------------------------------
// Warranty data helpers shared by automatic order warranty generation and the
// manual warranty card generator. The warranty period always comes from the
// product's own warranty data (structured `warranty` field, with a fallback to
// the "Warranty: ..." specification inside the product description) and is
// never hard-coded.
// ---------------------------------------------------------------------------

// Matches labels that clearly mean the product carries no warranty.
const NO_WARRANTY_RE = /^(no\s*warranty|no|none|nil|null|n\/a|na|without\s*warranty|0)(\s*(months?|mos?|years?|yrs?|days?|weeks?))?$|^0\s*$|^out\s*of\s*warranty$/i

const UNIT_TO_MONTHS = {
    year: 12,
    years: 12,
    yr: 12,
    yrs: 12,
    month: 1,
    months: 1,
    mo: 1,
    mos: 1,
    week: 0.25,
    weeks: 0.25,
    day: 1 / 30,
    days: 1 / 30,
}

// Converts a human label such as "3 Months", "1 Year", "1 Year 6 Months"
// into total months. Returns null when the label is empty or means no warranty.
export const parseWarrantyMonths = (label) => {
    const text = String(label || '').trim().replace(/\s+/g, ' ')
    if (!text || NO_WARRANTY_RE.test(text)) return null
    let months = 0
    let matched = false
    const re = /(\d+(?:\.\d+)?)\s*(years?|yrs?|months?|mos?|weeks?|days?)\b/gi
    let m
    while ((m = re.exec(text)) !== null) {
        matched = true
        const value = parseFloat(m[1])
        const unit = m[2].toLowerCase()
        months += value * (UNIT_TO_MONTHS[unit] != null ? UNIT_TO_MONTHS[unit] : 0)
    }
    if (!matched) return null
    return Math.round(months) > 0 ? Math.round(months) : null
}

// Pretty-prints a raw warranty label ("6 MONTHS" -> "6 Months").
export const normalizeWarrantyLabel = (label) =>
    String(label || '')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase()
        .replace(/\b([a-z])/g, (c) => c.toUpperCase()) || 'No Warranty'

// Reads the warranty from a product-shaped object:
//   1. structured `warranty` field (set from Admin Panel Add/Edit Product)
//   2. "Warranty: X" specification inside the description (legacy products)
// Returns { hasWarranty, periodLabel, periodMonths } — products without any
// warranty data resolve to hasWarranty:false ("No Warranty").
export const resolveProductWarranty = (product) => {
    let raw = ''
    if (product && product.warranty != null && String(product.warranty).trim() !== '') {
        raw = String(product.warranty).trim()
    }
    if (!raw && product && typeof product.description === 'string') {
        // Description specs are serialized as "Name: Value. Next: Value." where
        // dots/semicolons inside values may be escaped with a backslash.
        const m = product.description.match(/(?:^|[.;]\s*)Warranty\s*:\s*((?:[^.;\\]|\\.)+)/i)
        if (m) raw = m[1].trim()
    }
    const months = parseWarrantyMonths(raw)
    if (!months) {
        return { hasWarranty: false, periodLabel: 'No Warranty', periodMonths: null }
    }
    return { hasWarranty: true, periodLabel: normalizeWarrantyLabel(raw), periodMonths: months }
}

// Adds whole (or fractional) months to a timestamp, clamping to the last valid
// day of the resulting month (e.g. 30 Nov + 3 months -> 28/29 Feb).
export const addMonthsToDate = (timestamp, months) => {
    const d = new Date(timestamp)
    const whole = Math.floor(months)
    const fraction = months - whole
    const day = d.getDate()
    d.setMonth(d.getMonth() + whole)
    if (Number.isInteger(months)) {
        if (d.getDate() !== day) d.setDate(0)
    } else if (fraction > 0) {
        d.setDate(d.getDate() + Math.round(fraction * 30))
    }
    return d.getTime()
}

// Default coverage maintained by the store; used for automatic order cards and
// prefilled (and editable) for manual cards.
export const DEFAULT_COVERS = [
    'Manufacturing defects',
    'Charging circuit faults',
    'Internal component defects',
]

export const DEFAULT_EXCLUDES = [
    'Physical damage',
    'Water/liquid damage',
    'Burn damage',
    'Incorrect usage',
    'Unauthorized repairs',
]

export const DEFAULT_TERMS = [
    'This warranty card is valid only for the original purchaser and is non-transferable.',
    'The original purchase invoice or receipt must be presented for any warranty claim.',
    'The warranty period starts from the purchase date mentioned on this card.',
    'Voltique Hub will repair or replace defective parts at its own discretion.',
    'Repair or replacement time may vary depending on parts availability.',
    'The warranty becomes void if the product seal or warranty sticker is removed or damaged.',
].join(' ')
