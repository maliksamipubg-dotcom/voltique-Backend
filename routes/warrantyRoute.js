import express from "express"
import {
    createManualWarranty,
    listWarrantyCards,
    deleteWarrantyCard,
    downloadWarrantyPdf,
    getOrderWarrantyCards,
    downloadOrderWarrantyPdf,
} from '../controllers/warrantyController.js'
import adminAuth from "../middleware/adminAuth.js"

const warrantyRouter = express.Router()

//Admin Features
warrantyRouter.post('/create-manual', adminAuth, createManualWarranty)
warrantyRouter.post('/list', adminAuth, listWarrantyCards)
warrantyRouter.post('/delete', adminAuth, deleteWarrantyCard)
warrantyRouter.post('/pdf', adminAuth, downloadWarrantyPdf)
warrantyRouter.post('/order', adminAuth, getOrderWarrantyCards)
warrantyRouter.post('/order-pdf', adminAuth, downloadOrderWarrantyPdf)

export default warrantyRouter
