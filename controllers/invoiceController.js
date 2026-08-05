import orderModel from "../models/orderModel.js"
import { buildInvoicePdfBuffer } from "../utils/invoiceGenerator.js"

// Generates a print-ready A4 PDF invoice for a single order (admin only).
// The invoice is always built dynamically from the live order data stored in
// the database, so it always reflects the latest order information.
// The PDF is fully built into a Buffer before any headers are written, so
// generation errors always return a clean JSON response instead of a broken
// binary stream, and the browser receives a valid download.
const generateInvoice = async (req,res) =>{
    try {
        const { orderId } = req.body
        const order = await orderModel.findById(orderId)
        if (!order) {
            return res.json({success:false,message:'Order not found'})
        }

        const pdfBuffer = await buildInvoicePdfBuffer(order)

        const fileName = `Invoice-${order.orderId || order._id}.pdf`
        res.status(200)
        res.setHeader('Content-Type','application/pdf')
        res.setHeader('Content-Length', pdfBuffer.length)
        res.setHeader('Content-Disposition',`attachment; filename="${fileName}"`)
        res.send(pdfBuffer)
    } catch (error) {
        console.log(error)
        if (!res.headersSent) {
            res.json({success:false,message:error.message})
        }
    }
}

export { generateInvoice }
