import express from "express"
import {placeOrder,placeOrderStripe,placeOrderRazorpay,allOrders,userOrders,trackOrder,updateStatus,cancelOrder,deleteOrder} from '../controllers/orderController.js'
import { generateInvoice } from '../controllers/invoiceController.js'
import adminAuth from "../middleware/adminAuth.js"
import authUser from "../middleware/auth.js"

const orderRouter = express.Router()

//Admin Features
orderRouter.post('/list',adminAuth,allOrders)
orderRouter.post('/status',adminAuth,updateStatus)
orderRouter.post('/delete',adminAuth,deleteOrder)
orderRouter.post('/invoice',adminAuth,generateInvoice)

//Payment Features
orderRouter.post('/place',authUser,placeOrder)
orderRouter.post('/stripe',authUser,placeOrderStripe)
orderRouter.post('/razorpay',authUser,placeOrderRazorpay)

//User Feature
orderRouter.post('/userorders',authUser,userOrders)
orderRouter.post('/track',authUser,trackOrder)
orderRouter.post('/cancel',authUser,cancelOrder)

export default orderRouter