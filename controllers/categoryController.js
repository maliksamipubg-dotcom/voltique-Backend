import categoryModel from "../models/categoryModel.js"
import productModel from "../models/productModel.js"
import cache from "../utils/cache.js"

const CATEGORIES_CACHE_KEY = 'catalog:categories'

const invalidateCategoriesCache = () => {
    cache.invalidateByPrefix(CATEGORIES_CACHE_KEY)
}

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
        // Serve the cached, pre-serialized payload when available.
        const cached = cache.get(CATEGORIES_CACHE_KEY)
        if (cached) {
            res.setHeader('Content-Type', 'application/json')
            return res.send(cached)
        }

        // Fetch categories and product-per-category counts in parallel with a
        // single aggregation instead of issuing one count query per category.
        const [categories, counts] = await Promise.all([
            categoryModel.find({}).sort({ name: 1 }).lean(),
            productModel.aggregate([
                { $group: { _id: '$category', count: { $sum: 1 } } }
            ])
        ])
        const countMap = new Map(counts.map((c) => [c._id, c.count]))
        const result = categories.map((cat) => ({
            _id: cat._id,
            name: cat.name,
            date: cat.date,
            productCount: countMap.get(cat.name) || 0
        }))
        const payload = JSON.stringify({ success: true, categories: result })
        cache.set(CATEGORIES_CACHE_KEY, payload)
        res.setHeader('Content-Type', 'application/json')
        res.send(payload)
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
        invalidateCategoriesCache()
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
        invalidateCategoriesCache()
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
        invalidateCategoriesCache()
        res.json({ success: true, message: "Category deleted successfully." })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

export { getCategories, addCategory, updateCategory, deleteCategory }
