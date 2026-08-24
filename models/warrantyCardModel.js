import mongoose from "mongoose"

// A stored warranty card. Cards are created either automatically for website
// orders (source: 'Automatic Order') or manually by the admin from the Admin
// Panel (source: 'Manual'). Each card always gets a unique sequential number
// (WH-WC-000001, WH-WC-000002, ...) that is never reused.
const warrantyCardSchema = new mongoose.Schema({
    cardNumber:{ type: String, required: true, unique: true },
    source:{ type: String, enum: ['Automatic Order', 'Manual'], required: true },
    orderId:{ type: String, default: '' },       // internal order _id (automatic cards only)
    orderNumber:{ type: String, default: '' },   // public order id e.g. PH-20260824-1234
    customer:{
        name:{ type: String, required: true },
        phone:{ type: String, required: true },
        email:{ type: String, default: '' },
        address:{ type: String, default: '' },
        city:{ type: String, default: '' },
        state:{ type: String, default: '' },
        postalCode:{ type: String, default: '' },
        country:{ type: String, default: '' },
    },
    product:{
        productId:{ type: String, default: '' },
        name:{ type: String, required: true },
        image:{ type: Array, default: [] },
        model:{ type: String, default: 'Default' },
        category:{ type: String, default: '' },
        quantity:{ type: Number, default: 1 },
    },
    warranty:{
        hasWarranty:{ type: Boolean, required: true },
        periodLabel:{ type: String, default: 'No Warranty' },
        periodMonths:{ type: Number, default: null },
    },
    startDate:{ type: Number, required: true },
    expiryDate:{ type: Number, default: null },
    coverage:{
        covers:{ type: Array, default: [] },
        excludes:{ type: Array, default: [] },
    },
    terms:{ type: String, default: '' },
    notes:{ type: String, default: '' },
    date:{ type: Number, required: true },
})

const warrantyCardModel = mongoose.models.warrantycard || mongoose.model('warrantycard', warrantyCardSchema)

// Atomic counter so automatic and manual cards can never collide on numbers
// even when two cards are generated at the same moment.
const counterSchema = new mongoose.Schema({
    _id:{ type: String, required: true },
    seq:{ type: Number, default: 0 },
})
const warrantyCounterModel = mongoose.models.warrantycounter || mongoose.model('warrantycounter', counterSchema)

export const nextWarrantyCardNumber = async () => {
    const counter = await warrantyCounterModel.findOneAndUpdate(
        { _id: 'warranty_card' },
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
    )
    return `WH-WC-${String(counter.seq).padStart(6, '0')}`
}

export default warrantyCardModel
