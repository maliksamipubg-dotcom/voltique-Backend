import express from 'express'
import cors from 'cors'
import 'dotenv/config'
import connectDB from './config/mongodb.js'
import connectCloudinary from './config/cloudinary.js'
import userRouter from './routes/userRoute.js'
import productRouter from './routes/productRoute.js'
import cartRouter from './routes/cartRoute.js'
import orderRouter from './routes/orderRoute.js'
import reviewRouter from './routes/reviewRoute.js'
import categoryRouter from './routes/categoryRoute.js'


//App Config
const app = express()
const port = process.env.PORT || 4000
connectDB()
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

//api endpoints
app.use('/api/user',userRouter)
app.use('/api/product',productRouter )
app.use('/api/cart',cartRouter)
app.use('/api/order',orderRouter)
app.use('/api/review',reviewRouter)
app.use('/api/category',categoryRouter)
app.get('/',(req,res)=>{
    res.send("API Working")
})

// Vercel runs the exported Express app as a serverless function.
// app.listen() is only used when running locally.
if (process.env.VERCEL !== '1') {
  app.listen(port, ()=> console.log('Server started on PORT : '+ port))
}

export default app
