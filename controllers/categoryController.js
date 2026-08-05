import categoryModel from "../models/categoryModel.js"
import productModel from "../models/productModel.js"

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const findDuplicate = async (name, excludeId = null) => {
    const query = { name: { $regex: new RegExp('^' + escapeRegex(name) + '$', 'i') } }
    if (excludeId) {
        query._id = { $ne: excludeId }
    }
    return categoryModel.findOne(query)
}

//list all categories (public)
const getCategories = async (req,res) => {
    try {
        const categories = await categoryModel.find({}).sort({ name: 1 })
        const counts = await Promise.all(
            categories.map((cat) => productModel.countDocuments({ category: cat.name }))
        )
        const result = categories.map((cat, i) => ({
            _id: cat._id,
            name: cat.name,
            date: cat.date,
            productCount: counts[i]
        }))
        res.json({ success: true, categories: result })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

//add new category (admin)
const addCategory = async (req,res) => {
    try {
        const { name } = req.body
        const trimmed = (name || '').trim()
        if (!trimmed) {
            return res.json({ success: false, message: "Category name is required." })
        }
        const existing = await findDuplicate(trimmed)
        if (existing) {
            return res.json({ success: false, message: "Category already exists." })
        }
        const category = new categoryModel({ name: trimmed, date: Date.now() })
        await category.save()
        res.json({ success: true, message: "Category created successfully.", category })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

//rename a category and update all its products (admin)
const updateCategory = async (req,res) => {
    try {
        const { id, name } = req.body
        const trimmed = (name || '').trim()
        if (!trimmed) {
            return res.json({ success: false, message: "Category name is required." })
        }
        const category = await categoryModel.findById(id)
        if (!category) {
            return res.json({ success: false, message: "Category not found." })
        }
        if (category.name.toLowerCase() === trimmed.toLowerCase()) {
            return res.json({ success: false, message: "Please enter a new category name." })
        }
        const existing = await findDuplicate(trimmed, id)
        if (existing) {
            return res.json({ success: false, message: "Category already exists." })
        }
        const oldName = category.name
        await categoryModel.findByIdAndUpdate(id, { name: trimmed })
        await productModel.updateMany({ category: oldName }, { category: trimmed })
        res.json({ success: true, message: "Category updated successfully." })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

//delete a category (admin) — blocked if products exist inside it
const deleteCategory = async (req,res) => {
    try {
        const { id } = req.body
        const category = await categoryModel.findById(id)
        if (!category) {
            return res.json({ success: false, message: "Category not found." })
        }
        const count = await productModel.countDocuments({ category: category.name })
        if (count > 0) {
            return res.json({ success: false, message: "This category contains products. Please move or delete those products before deleting this category." })
        }
        await categoryModel.findByIdAndDelete(id)
        res.json({ success: true, message: "Category deleted successfully." })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

export { getCategories, addCategory, updateCategory, deleteCategory }
