import express from 'express'
import {
    addReview, updateReview, deleteReview, getProductReviews, helpfulReview,
    myReviews, checkEligibility, allReviews, updateReviewStatus, adminUpdateReview, adminDeleteReview
} from '../controllers/reviewController.js'
import authUser from '../middleware/auth.js'
import adminAuth from '../middleware/adminAuth.js'

const reviewRouter = express.Router()

//User Features
reviewRouter.post('/add', authUser, addReview)
reviewRouter.post('/update', authUser, updateReview)
reviewRouter.post('/delete', authUser, deleteReview)
reviewRouter.post('/product', getProductReviews)
reviewRouter.post('/helpful', authUser, helpfulReview)
reviewRouter.post('/my-reviews', authUser, myReviews)
reviewRouter.post('/eligibility', authUser, checkEligibility)

//Admin Features
reviewRouter.post('/list', adminAuth, allReviews)
reviewRouter.post('/status', adminAuth, updateReviewStatus)
reviewRouter.post('/admin-update', adminAuth, adminUpdateReview)
reviewRouter.post('/admin-delete', adminAuth, adminDeleteReview)

export default reviewRouter
