import mongoose from "mongoose"

const manualInvoiceSchema = new mongoose.Schema({
    invoiceNumber:{ type: String, required: true, unique: true },
    customer:{
        name:{ type: String, required: true },
        phone:{ type: String, required: true },
        email:{ type: String, default: '' },
        address:{ type: String, required: true },
    },
    items:[{
        productId:{ type: String },
        name:{ type: String, required: true },
        image:{ type: Array, default: [] },
        category:{ type: String, default: '' },
        size:{ type: String, default: 'Default' },
        originalPrice:{ type: Number, default: 0 },
        price:{ type: Number, required: true },
        quantity:{ type: Number, required: true },
    }],
    subtotal:{ type: Number, required: true },
    discount:{ type: Number, default: 0 },
    grandTotal:{ type: Number, required: true },
    advancePayment:{ type: Number, default: 0 },
    remainingBalance:{ type: Number, required: true },
    notes:{ type: String, default: '' },
    date:{ type: Number, required: true },
})
const manualInvoiceModel = mongoose.models.manualinvoice || mongoose.model('manualinvoice',manualInvoiceSchema)
export default manualInvoiceModel;
