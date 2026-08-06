import productModel from '../models/productModel.js'
import categoryModel from '../models/categoryModel.js'
import reviewModel from '../models/reviewModel.js'
import orderModel from '../models/orderModel.js'
import manualInvoiceModel from '../models/manualInvoiceModel.js'

// Ensures the database indexes used by the most frequent public queries exist.
// Index creation is idempotent (same spec on an existing index is a no-op),
// so running it on every serverless instance is safe. Failures are logged but
// never block requests — an unindexed query is slower but still works.
const ensureIndexes = async () => {
  const tasks = [
    // Public catalog queries
    productModel.collection.createIndex({ category: 1 }),
    productModel.collection.createIndex({ subCategory: 1 }),
    productModel.collection.createIndex({ bestseller: 1 }),
    productModel.collection.createIndex({ featured: 1 }),
    productModel.collection.createIndex({ stock: 1 }),
    productModel.collection.createIndex({ date: -1 }),
    productModel.collection.createIndex({ category: 1, date: -1 }),
    categoryModel.collection.createIndex({ name: 1 }),
    // Review queries
    reviewModel.collection.createIndex({ productId: 1, status: 1 }),
    reviewModel.collection.createIndex({ productId: 1, date: -1 }),
    reviewModel.collection.createIndex({ userId: 1, productId: 1 }),
    reviewModel.collection.createIndex({ reviewId: 1 }),
    // Order queries
    orderModel.collection.createIndex({ userId: 1, date: -1 }),
    orderModel.collection.createIndex({ orderId: 1 }),
    orderModel.collection.createIndex({ date: -1 }),
    // Manual invoice queries
    manualInvoiceModel.collection.createIndex({ invoiceNumber: 1 }),
    manualInvoiceModel.collection.createIndex({ date: -1 }),
  ]

  const results = await Promise.allSettled(tasks)
  for (const result of results) {
    if (result.status === 'rejected' && result.reason) {
      console.log('Index creation failed:', result.reason.message || result.reason)
    }
  }
}

export default ensureIndexes
