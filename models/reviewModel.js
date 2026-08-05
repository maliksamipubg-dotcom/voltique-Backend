import mongoose from "mongoose";

const reviewSchema = new mongoose.Schema({
    reviewId:{ type: String, required: true},
    productId:{ type: String, required: true},
    orderId:{ type: String, required: true},
    userId:{ type: String, required: true},
    customerName:{ type: String, required: true},
    customerEmail:{ type: String, required: true},
    rating:{ type: Number, required: true},
    title:{ type: String, default: ''},
    description:{ type: String, required: true},
    verified:{ type: Boolean, default: true},
    helpful:{ type: Number, default: 0},
    helpfulBy:{ type: Array, default: []},
    status:{ type: String, default: 'Approved'},
    productName:{ type: String, default: ''},
    productImage:{ type: String, default: ''},
    date:{ type: Number, required: true},
    updatedDate:{ type: Number, default: null},
})
const reviewModel = mongoose.models.review || mongoose.model("review", reviewSchema);

export default reviewModel;
