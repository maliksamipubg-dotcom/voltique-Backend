import express from 'express'
import productModel from '../models/productModel.js'

// Meta / Facebook product catalogue feed.
//
// Served as an RSS 2.0 XML document using the Google Merchant Center `g:`
// namespace, which Meta Commerce Manager accepts for scheduled catalogue
// feeds. The document is generated live from MongoDB on every request and is
// never cached, so product additions, edits, price and stock changes are
// reflected the next time Meta fetches the feed.
const SITE_URL = 'https://voltiquehub.vercel.app'
const BRAND_FALLBACK = 'Voltique Hub'
const CURRENCY = 'PKR'

// Must mirror the frontend slug generation (src/utils/seo.js) and the sitemap
// route so feed links resolve to the exact same canonical product pages.
const slugify = (text) =>
  String(text || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

const escapeXml = (text) =>
  String(text == null ? '' : text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

// Same stock logic the sitemap uses: a product is active/available unless its
// stock value is exactly "out of stock" (case-insensitive).
const isAvailable = (product) =>
  !/^\s*out of stock\s*$/i.test(String(product.stock || ''))

const getProductUrl = (product) =>
  `${SITE_URL}/product/${slugify(product.name)}-${product._id}`

const getImageUrl = (product) => {
  const images = Array.isArray(product.image) ? product.image : [product.image]
  const first = images.find((url) => typeof url === 'string' && url.trim())
  return first ? first.trim() : ''
}

// `price` is the final selling price in PKR. Meta requires two decimal places.
const getPrice = (product) => {
  const value = Number(product.price)
  return Number.isFinite(value) && value >= 0 ? value.toFixed(2) : '0.00'
}

const buildFeed = (products) => {
  const items = (products || [])
    .map((product) => {
      const lines = [
        `      <g:id>${escapeXml(product._id)}</g:id>`,
        `      <g:title>${escapeXml(product.name)}</g:title>`,
        `      <g:description>${escapeXml(product.description)}</g:description>`,
        `      <g:link>${escapeXml(getProductUrl(product))}</g:link>`,
      ]
      const image = getImageUrl(product)
      if (image) {
        lines.push(`      <g:image_link>${escapeXml(image)}</g:image_link>`)
      }
      lines.push(
        `      <g:price>${getPrice(product)} ${CURRENCY}</g:price>`,
        `      <g:availability>${isAvailable(product) ? 'in stock' : 'out of stock'}</g:availability>`,
        `      <g:condition>new</g:condition>`,
        `      <g:brand>${escapeXml(product.subCategory || BRAND_FALLBACK)}</g:brand>`,
        `      <g:identifier_exists>no</g:identifier_exists>`
      )
      return `    <item>\n${lines.join('\n')}\n    </item>`
    })
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>Voltique Hub Product Feed</title>
    <link>${SITE_URL}</link>
    <description>Meta / Facebook product catalogue feed for Voltique Hub</description>
${items}
  </channel>
</rss>`
}

const metaFeedRouter = express.Router()

metaFeedRouter.get('/', async (req, res) => {
  try {
    const products = await productModel
      .find({})
      .select('name description price image category subCategory stock _id')
      .lean()
    const activeProducts = products.filter(isAvailable)
    res.setHeader('Content-Type', 'application/xml; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store, max-age=0')
    res.send(buildFeed(activeProducts))
  } catch (error) {
    console.log(error)
    res.setHeader('Content-Type', 'application/xml; charset=utf-8')
    res.status(500).send(buildFeed([]))
  }
})

export default metaFeedRouter
