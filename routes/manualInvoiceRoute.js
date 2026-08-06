import express from "express"
import { createManualInvoice, listManualInvoices, deleteManualInvoice, downloadManualInvoicePdf } from '../controllers/manualInvoiceController.js'
import adminAuth from "../middleware/adminAuth.js"

const manualInvoiceRouter = express.Router()

//Admin Features
manualInvoiceRouter.post('/create',adminAuth,createManualInvoice)
manualInvoiceRouter.post('/list',adminAuth,listManualInvoices)
manualInvoiceRouter.post('/delete',adminAuth,deleteManualInvoice)
manualInvoiceRouter.post('/pdf',adminAuth,downloadManualInvoicePdf)

export default manualInvoiceRouter
