import express from 'express'
import productModel from '../models/productModel.js'
import cache from '../utils/cache.js'

const SITEMAP_CACHE_KEY = 'seo:sitemap'
const SITEMAP_TTL_MS = 10 * 60 * 1000
const SITE_URL = 'https://voltiquehub.vercel.app'

// Must mirror the frontend slug generation (src/utils/seo.js) so sitemap URLs
// match the canonical URLs emitted by the storefront.
const slugify = (text) =>
  String(text || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

const escapeXml = (text) =>
  String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

const staticPages = [
  { path: '/', priority: '1.0', freq: 'daily' },
  { path: '/collections', priority: '0.9', freq: 'daily' },
  { path: '/about', priority: '0.7', freq: 'monthly' },
  { path: '/contact', priority: '0.7', freq: 'monthly' },
  { path: '/cart', priority: '0.5', freq: 'weekly' },
  { path: '/login', priority: '0.4', freq: 'monthly' },
]

const buildSitemap = (products) => {
  const staticUrls = staticPages
    .map(
      (p) =>
        `  <url>\n    <loc>${SITE_URL}${p.path}</loc>\n    <changefreq>${p.freq}</changefreq>\n    <priority>${p.priority}</priority>\n  </url>`
    )
    .join('\n')

  const productUrls = (products || [])
    .map((product) => {
      const slug = slugify(product.name)
      const loc = `${SITE_URL}/product/${slug}-${product._id}`
      const lastmod = product.date ? new Date(product.date).toISOString().slice(0, 10) : ''
      return `  <url>\n    <loc>${escapeXml(loc)}</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ''}\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>`
    })
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${staticUrls}\n${productUrls}\n</urlset>`
}

const sitemapRouter = express.Router()

sitemapRouter.get('/', async (req, res) => {
  try {
    const cached = cache.get(SITEMAP_CACHE_KEY)
    if (cached) {
      res.setHeader('Content-Type', 'application/xml')
      return res.send(cached)
    }
    const products = await productModel.find({}).select('name date _id').lean()
    const xml = buildSitemap(products)
    cache.set(SITEMAP_CACHE_KEY, xml, SITEMAP_TTL_MS)
    res.setHeader('Content-Type', 'application/xml')
    res.send(xml)
  } catch (error) {
    console.log(error)
    res.setHeader('Content-Type', 'application/xml')
    res.status(500).send('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>')
  }
})

export default sitemapRouter
