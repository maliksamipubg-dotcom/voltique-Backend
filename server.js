import express from 'express'
import cors from 'cors'
import 'dotenv/config'
import connectDB from './config/mongodb.js'
import connectCloudinary from './config/cloudinary.js'
import ensureIndexes from './utils/dbIndexes.js'
import userRouter from './routes/userRoute.js'
import productRouter from './routes/productRoute.js'
import cartRouter from './routes/cartRoute.js'
import orderRouter from './routes/orderRoute.js'
import reviewRouter from './routes/reviewRoute.js'
import categoryRouter from './routes/categoryRoute.js'
import manualInvoiceRouter from './routes/manualInvoiceRoute.js'
import sitemapRouter from './routes/sitemapRoute.js'


//App Config
const app = express()
const port = process.env.PORT || 4000

// Verify critical environment variables are present (values are never logged).
const CRITICAL_ENV_VARS = ['MONGODB_URI', 'JWT_SECRET', 'CLOUDINARY_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_SECRET_KEY']
for (const key of CRITICAL_ENV_VARS) {
  if (!process.env[key]) {
    console.log('Missing environment variable: ' + key)
  }
}

// Kick off the connection during cold start so the first request does not
// have to wait for module-load + connect. Safe to call repeatedly — the
// connection attempt is cached and shared inside config/mongodb.js, so this
// never opens a duplicate connection.
connectDB()
  .then(() => {
    // Ensure query indexes exist. Runs in the background and never blocks
    // requests — an unindexed query is slower but still works.
    ensureIndexes().catch((error) => {
      console.log('Index setup failed:', error && error.message ? error.message : error)
    })
  })
  .catch((error) => {
    console.log('MongoDB Connection Failed:', error.message)
  })

connectCloudinary()

const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'https://voltiquehub.vercel.app,http://localhost:5173,http://localhost:3000,http://localhost:4000')
  .split(',')
  .map((origin) => origin.trim().replace(/\/+$/, ''))
  .filter(Boolean)

const isAllowedOrigin = (origin) => {
  if (!origin) return true
  const cleanOrigin = origin.replace(/\/+$/, '')
  return allowedOrigins.includes(cleanOrigin) || cleanOrigin.endsWith('.vercel.app')
}

//middleware
app.use(express.json())
app.use(cors({
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) {
      callback(null, true)
    } else {
      callback(null, false)
    }
  },
  exposedHeaders: ['Content-Disposition', 'Content-Length', 'Content-Type'],
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'token', 'Accept', 'X-Requested-With'],
  credentials: false,
}))

// Database connection guard: Express never processes an API request before
// MongoDB is connected. Concurrent cold-start requests share a single cached
// connection attempt (see config/mongodb.js) instead of buffering queries for
// 10 seconds and failing with "Operation buffering timed out after 10000ms".
app.use(async (req, res, next) => {
  try {
    await connectDB()
    next()
  } catch (error) {
    console.log('MongoDB Connection Failed:', error.message)
    res.status(503).json({ success: false, message: 'Database temporarily unavailable. Please try again in a moment.' })
  }
})

//api endpoints
app.use('/api/user',userRouter)
app.use('/api/product',productRouter )
app.use('/api/cart',cartRouter)
app.use('/api/order',orderRouter)
app.use('/api/review',reviewRouter)
app.use('/api/category',categoryRouter)
app.use('/api/manual-invoice',manualInvoiceRouter)
app.use('/sitemap.xml', sitemapRouter)
app.get('/',(req,res)=>{
    res.send("API Working")
})

// Vercel runs the exported Express app as a serverless function.
// app.listen() is only used when running locally, and only after MongoDB
// has connected successfully.
if (process.env.VERCEL !== '1') {
  connectDB()
    .then(() => {
      app.listen(port, () => console.log('Server started on PORT : ' + port))
    })
    .catch((error) => {
      console.log('MongoDB Connection Failed:', error.message)
      process.exit(1)
    })
}

export default app
