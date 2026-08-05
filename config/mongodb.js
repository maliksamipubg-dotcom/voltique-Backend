import mongoose from 'mongoose'

// Disable Mongoose query buffering globally (applies to the default connection
// and therefore to ALL models: User, Product, Review, Order, Category).
//
// Default behaviour buffers queries issued while the database is not connected,
// silently delaying requests for up to 10 seconds and then throwing
// "Operation ... buffering timed out after 10000ms". The connection guard
// middleware in server.js guarantees the database is connected before any
// controller runs, so a query arriving on a closed connection should fail fast
// instead of hanging.
mongoose.set('bufferCommands', false)

const DEFAULT_DB_NAME = 'e-commerce'

// Production / Vercel serverless friendly connection options.
// - maxPoolSize: one small pool per serverless instance (configurable via env).
// - minPoolSize: 0 so idle sockets are not kept open on short-lived instances.
// - Short selection/connect timeouts so cold starts fail fast and retry
//   instead of stalling for Mongoose's 30s default.
const MONGODB_OPTIONS = {
  bufferCommands: false,
  maxPoolSize: parseInt(process.env.MONGODB_MAX_POOL_SIZE || '10', 10),
  minPoolSize: 0,
  serverSelectionTimeoutMS: 10000,
  connectTimeoutMS: 10000,
  socketTimeoutMS: 45000,
  family: 4,
  retryWrites: true,
  w: 'majority',
}

// Cached connection promise shared by every request in this serverless
// instance. Without it, each concurrent cold-start request would open its own
// connection attempt.
let connectionPromise = null

let listenersRegistered = false
let hasConnected = false

const setupMongooseEventListeners = () => {
  if (listenersRegistered) return
  listenersRegistered = true

  mongoose.connection.on('connecting', () => {
    console.log('MongoDB Connecting...')
  })

  mongoose.connection.on('connected', () => {
    hasConnected = true
    console.log('MongoDB Connected')
  })

  mongoose.connection.on('disconnected', () => {
    console.log('MongoDB Disconnected')
    connectionPromise = null
    if (hasConnected) {
      // Mongoose / the MongoDB driver reconnects automatically after a drop.
      console.log('MongoDB Reconnecting...')
    }
  })

  mongoose.connection.on('reconnected', () => {
    console.log('MongoDB Reconnected')
  })

  mongoose.connection.on('close', () => {
    console.log('MongoDB Connection Closed')
    connectionPromise = null
  })

  mongoose.connection.on('error', (err) => {
    console.log('MongoDB Connection Error:', err && err.message ? err.message : err)
  })
}

const getMongoUri = () => {
  const base = (process.env.MONGODB_URI || '').trim()
  if (!base || !/^mongodb(\+srv)?:\/\//.test(base)) {
    throw new Error('MONGODB_URI is not set or is invalid in the environment variables')
  }

  // A database path (or query string) only exists AFTER the protocol prefix.
  // Checking for any "/" without stripping the protocol would wrongly match
  // the "//" inside "mongodb+srv://" and connect to the driver's default
  // ("test") database instead of the real one.
  const rest = base.replace(/^mongodb(\+srv)?:\/\//, '')
  if (rest.includes('/')) {
    // URI already targets a database or has a query string — use as-is.
    return base
  }
  return `${base}/${DEFAULT_DB_NAME}`
}

const connectDB = async () => {
  setupMongooseEventListeners()

  const state = mongoose.connection.readyState

  // Already connected — reuse the existing connection immediately.
  if (state === 1) {
    return mongoose.connection
  }

  // A connection attempt is already in progress (initial connect or an
  // automatic driver reconnect) — wait for it instead of opening another.
  if (state === 2) {
    await mongoose.connection.asPromise()
    return mongoose.connection
  }

  // Disconnected / never connected — always start from a fresh cached attempt
  // so concurrent requests share ONE connection.
  connectionPromise = mongoose.connect(getMongoUri(), MONGODB_OPTIONS)

  try {
    await connectionPromise
  } catch (error) {
    connectionPromise = null
    console.log('MongoDB Connection Failed:', error && error.message ? error.message : error)
    throw error
  }

  return mongoose.connection
}

export default connectDB
