import mongoose from "mongoose";

const categorySchema = new mongoose.Schema({
    name:{ type: String, required: true, trim: true },
    date:{ type: Number, required: true },
})
const categoryModel = mongoose.models.category || mongoose.model("category",categorySchema);

export default categoryModel
