import reviewModel from "../models/reviewModel.js";
import orderModel from "../models/orderModel.js";
import userModel from "../models/userModel.js";
import productModel from "../models/productModel.js";
import cache from "../utils/cache.js";

const PRODUCTS_CACHE_KEY = 'catalog:products'

const recomputeProductRating = async (productId) => {
    try {
        const reviews = await reviewModel.find({ productId, status: 'Approved' })
        const reviewCount = reviews.length
        let avg = 0
        if (reviewCount > 0) {
            const sum = reviews.reduce((acc, r) => acc + r.rating, 0)
            avg = Math.round((sum / reviewCount) * 10) / 10
        }
        await productModel.findByIdAndUpdate(productId, { avgRating: avg, reviewCount })
        // avgRating / reviewCount are shown in the catalog, so drop the cache.
        cache.invalidateByPrefix(PRODUCTS_CACHE_KEY)
    } catch (error) {
        console.log(error)
    }
}

const generateReviewId = () => 'RV-' + Date.now().toString().slice(-8)

const validateReviewFields = (rating, description) => {
    if (!rating || !Number.isInteger(Number(rating)) || Number(rating) < 1 || Number(rating) > 5) {
        return "Please select a rating between 1 and 5 stars."
    }
    if (!description || !description.trim()) {
        return "Please write a review description."
    }
    if (description.trim().length > 500) {
        return "Review description must be a maximum of 500 characters."
    }
    return ""
}

//user adds or updates a review (only verified delivered purchase)
const addReview = async (req,res) => {
    try {
        const { userId, productId, orderId, rating, title, description } = req.body

        const user = await userModel.findById(userId)
        if (!user) {
            return res.json({ success: false, message: "User not found" })
        }

        const order = await orderModel.findOne({ orderId, userId })
        if (!order) {
            return res.json({ success: false, message: "You can review this product after your order has been delivered." })
        }
        if (order.status !== 'Delivered') {
            return res.json({ success: false, message: "You can review this product after your order has been delivered." })
        }
        const purchasedItem = order.items.find((item) => item._id === productId)
        if (!purchasedItem) {
            return res.json({ success: false, message: "You can review this product after your order has been delivered." })
        }

        const err = validateReviewFields(rating, description)
        if (err) {
            return res.json({ success: false, message: err })
        }

        const product = await productModel.findById(productId)
        if (!product) {
            return res.json({ success: false, message: "Product not found" })
        }

        const existingReview = await reviewModel.findOne({ userId, productId })
        if (existingReview) {
            const updateData = {
                rating: Number(rating),
                title: title || '',
                description: description.trim(),
                orderId: existingReview.orderId || orderId,
                status: 'Approved',
                updatedDate: Date.now()
            }
            await reviewModel.findByIdAndUpdate(existingReview._id, updateData)
            await recomputeProductRating(productId)
            return res.json({ success: true, message: "Review updated successfully." })
        }

        const review = new reviewModel({
            reviewId: generateReviewId(),
            productId,
            orderId,
            userId,
            customerName: user.name,
            customerEmail: user.email,
            rating: Number(rating),
            title: title || '',
            description: description.trim(),
            verified: true,
            productName: product.name,
            productImage: product.image && product.image[0] ? product.image[0] : '',
            status: 'Approved',
            date: Date.now()
        })
        await review.save()
        await recomputeProductRating(productId)
        res.json({ success: true, message: "Review submitted successfully." })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

//user updates their own review
const updateReview = async (req,res) => {
    try {
        const { userId, reviewId, rating, title, description } = req.body
        const err = validateReviewFields(rating, description)
        if (err) {
            return res.json({ success: false, message: err })
        }
        const review = await reviewModel.findOne({ reviewId, userId })
        if (!review) {
            return res.json({ success: false, message: "Review not found" })
        }
        await reviewModel.findByIdAndUpdate(review._id, {
            rating: Number(rating),
            title: title || '',
            description: description.trim(),
            updatedDate: Date.now()
        })
        await recomputeProductRating(review.productId)
        res.json({ success: true, message: "Review updated successfully." })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

//user deletes their own review
const deleteReview = async (req,res) => {
    try {
        const { userId, reviewId } = req.body
        const review = await reviewModel.findOne({ reviewId, userId })
        if (!review) {
            return res.json({ success: false, message: "Review not found" })
        }
        await reviewModel.findByIdAndDelete(review._id)
        await recomputeProductRating(review.productId)
        res.json({ success: true, message: "Review deleted successfully." })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

//public: get approved reviews + stats for a product
const getProductReviews = async (req,res) => {
    try {
        const { productId, sort } = req.body
        const reviews = await reviewModel.find({ productId, status: 'Approved' }).sort({ date: -1 })

        let sorted = [...reviews]
        if (sort === 'highest') sorted.sort((a, b) => b.rating - a.rating)
        else if (sort === 'lowest') sorted.sort((a, b) => a.rating - b.rating)
        else if (sort === 'helpful') sorted.sort((a, b) => b.helpful - a.helpful)
        else sorted.sort((a, b) => b.date - a.date)

        let avg = 0
        const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
        if (reviews.length > 0) {
            const sum = reviews.reduce((acc, r) => acc + r.rating, 0)
            avg = Math.round((sum / reviews.length) * 10) / 10
        }
        reviews.forEach((r) => {
            distribution[r.rating] = (distribution[r.rating] || 0) + 1
        })

        res.json({ success: true, reviews: sorted, avgRating: avg, totalReviews: reviews.length, distribution })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

//user marks a review helpful
const helpfulReview = async (req,res) => {
    try {
        const { userId, reviewId } = req.body
        const review = await reviewModel.findOne({ reviewId })
        if (!review) {
            return res.json({ success: false, message: "Review not found" })
        }
        if (review.helpfulBy.includes(userId)) {
            return res.json({ success: false, message: "You already marked this review as helpful" })
        }
        await reviewModel.findByIdAndUpdate(review._id, {
            helpful: review.helpful + 1,
            $push: { helpfulBy: userId }
        })
        res.json({ success: true, message: "Thanks for your feedback." })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

//user's own reviews
const myReviews = async (req,res) => {
    try {
        const { userId } = req.body
        const reviews = await reviewModel.find({ userId }).sort({ date: -1 })
        res.json({ success: true, reviews })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

//check if user can review a product (delivered purchase without review)
const checkEligibility = async (req,res) => {
    try {
        const { userId, productId } = req.body
        const orders = await orderModel.find({ userId }).sort({ date: -1 })
        const deliveredOrders = orders.filter((order) => order.status === 'Delivered' && order.items.some((item) => item._id === productId))
        const existingReview = await reviewModel.findOne({ userId, productId })
        res.json({
            success: true,
            eligible: deliveredOrders.length > 0,
            hasReviewed: !!existingReview,
            review: existingReview || null,
            deliveredOrders
        })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

//admin: all reviews with filters
const allReviews = async (req,res) => {
    try {
        const { search, productId, rating, status } = req.body
        const filter = {}
        if (productId) filter.productId = productId
        if (rating) filter.rating = Number(rating)
        if (status) filter.status = status
        if (search) {
            filter.$or = [
                { customerName: { $regex: search, $options: 'i' } },
                { customerEmail: { $regex: search, $options: 'i' } },
                { title: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
                { productName: { $regex: search, $options: 'i' } },
                { orderId: { $regex: search, $options: 'i' } }
            ]
        }
        const reviews = await reviewModel.find(filter).sort({ date: -1 })
        res.json({ success: true, reviews })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

//admin: approve or hide a review
const updateReviewStatus = async (req,res) => {
    try {
        const { reviewId, status } = req.body
        const review = await reviewModel.findOne({ reviewId })
        if (!review) {
            return res.json({ success: false, message: "Review not found" })
        }
        await reviewModel.findByIdAndUpdate(review._id, { status, updatedDate: Date.now() })
        await recomputeProductRating(review.productId)
        res.json({ success: true, message: status === 'Hidden' ? 'Review hidden' : 'Review approved' })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

//admin: edit a review
const adminUpdateReview = async (req,res) => {
    try {
        const { reviewId, rating, title, description, status } = req.body
        const review = await reviewModel.findOne({ reviewId })
        if (!review) {
            return res.json({ success: false, message: "Review not found" })
        }
        const err = validateReviewFields(rating, description)
        if (err) {
            return res.json({ success: false, message: err })
        }
        await reviewModel.findByIdAndUpdate(review._id, {
            rating: Number(rating),
            title: title || '',
            description: description.trim(),
            status: status || review.status,
            updatedDate: Date.now()
        })
        await recomputeProductRating(review.productId)
        res.json({ success: true, message: "Review updated" })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

//admin: delete a review
const adminDeleteReview = async (req,res) => {
    try {
        const { reviewId } = req.body
        const review = await reviewModel.findOne({ reviewId })
        if (!review) {
            return res.json({ success: false, message: "Review not found" })
        }
        await reviewModel.findByIdAndDelete(review._id)
        await recomputeProductRating(review.productId)
        res.json({ success: true, message: "Review deleted successfully." })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

export { addReview, updateReview, deleteReview, getProductReviews, helpfulReview, myReviews, checkEligibility, allReviews, updateReviewStatus, adminUpdateReview, adminDeleteReview, recomputeProductRating }
