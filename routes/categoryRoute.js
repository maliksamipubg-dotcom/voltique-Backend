import express from 'express'
import { getCategories, addCategory, updateCategory, deleteCategory } from '../controllers/categoryController.js'
import adminAuth from '../middleware/adminAuth.js'

const categoryRouter = express.Router();

categoryRouter.get('/list', getCategories)
categoryRouter.post('/add', adminAuth, addCategory)
categoryRouter.post('/update', adminAuth, updateCategory)
categoryRouter.post('/delete', adminAuth, deleteCategory)

export default categoryRouter
