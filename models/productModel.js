import mongoose from "mongoose";

const productSchema = new mongoose.Schema({
    name:{type: String, required: true},
    description:{type: String, required: true},
    price:{type: Number, required: true},
    image:{type: Array, required: true},
    category:{type: String, required: true},
    subCategory:{type: String, required: true},
    sizes:{type: Array, required: true},
    options:{type: Array, default: []},
    bestseller:{type: Boolean},
    stock:{type: String, default: 'In Stock'},
    featured:{type: Boolean, default: false},
    avgRating:{type: Number, default: 0},
    reviewCount:{type: Number, default: 0},
    date:{type: Number, required: true},
})
const productModel = mongoose.models.product || mongoose.model("product",productSchema);

export default productModel