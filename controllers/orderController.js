import orderModel from "../models/orderModel.js"
import userModel from "../models/userModel.js";
import reviewModel from "../models/reviewModel.js";
import { recomputeProductRating } from "./reviewController.js";
import { sendOrderNotificationEmail, sendOrderConfirmationEmail } from "../utils/sendEmail.js";
import { generateWarrantyCardsForOrder } from "./warrantyController.js";

//placing order using cod method
const placeOrder = async (req,res) =>{
    try {
        const {userId, items, amount, address} = req.body;
        const now = new Date();
        const dateStr = now.toISOString().slice(0,10).replace(/-/g,'');
        const orderId = 'PH-' + dateStr + '-' + String(Math.floor(Math.random()*9000)+1000);
        const orderData ={
            userId,
            items,
            address,
            amount,
            paymentMethod:"COD",
            payment:false,
            date:Date.now(),
            orderId,
            estimatedDelivery: Date.now() + 5*24*60*60*1000,
            statusUpdates:[{status:'Order Placed', date:Date.now()}]
        }
        const newOrder = new orderModel(orderData)
        await newOrder.save()

        // Notify the store owner via Gmail. The email is sent after the order
        // is successfully saved, and any email failure must NOT affect the
        // customer's order, so it is caught and logged here.
        try {
            await sendOrderNotificationEmail(newOrder)
        } catch (emailError) {
            console.log("Email notification failed:", emailError)
        }

        // Send an order confirmation email to the customer. This is also
        // fire-and-forget so any failure here never affects the saved order.
        try {
            await sendOrderConfirmationEmail(newOrder)
        } catch (emailError) {
            console.log("Customer confirmation email failed:", emailError)
        }

        await userModel.findByIdAndUpdate(userId,{cartData:{}})

        // Automatically generate warranty cards for the eligible (warranted)
        // products in this order. Fully isolated: any failure here is logged
        // and never affects the customer's saved order. Cards are stored once
        // per order/product, so repeated views never create duplicates.
        try {
            await generateWarrantyCardsForOrder(newOrder)
        } catch (warrantyError) {
            console.log("Warranty card generation failed:", warrantyError)
        }

        res.json({success:true,message:"Order Placed",order:newOrder})

        
    } catch (error) {
        console.log(error)
        res.json({success:false,message:error.message})
        
    }
}

//placing order using stripe method
const placeOrderStripe = async (req,res) =>{
    
}

//placing order using razorpay method
const placeOrderRazorpay = async (req,res) =>{
    
}

//all orders data for admin panel
const allOrders = async (req,res) =>{
    try {
        const orders = await orderModel.find({})
        res.json({success:true,orders})
    } catch (error) {
        console.log(error)
        res.json({success:false,message:error.message})
        
    }
}

//user order data for frontend
const userOrders = async (req,res) =>{
    try {
        const {userId} = req.body
        const orders = await orderModel.find({userId}).sort({date:-1})
        res.json({success:true,orders})
    } catch (error) {
        console.log(error)
        res.json({success:false,message:error.message})
    }
}

//single order tracking data for frontend
const trackOrder = async (req,res) =>{
    try {
        const {userId, orderId} = req.body
        const order = await orderModel.findOne({orderId})
        if (!order) {
            return res.json({success:false,message:"Order not found"})
        }
        if (order.userId !== userId) {
            return res.json({success:false,message:"Order not found"})
        }
        res.json({success:true,order})
    } catch (error) {
        console.log(error)
        res.json({success:false,message:error.message})
    }
}

//update order status for admin panel
const updateStatus = async (req,res) =>{
    try {
        const { orderId, status } = req.body
        const order = await orderModel.findById(orderId)
        if (!order) {
            return res.json({success:false,message:'Order not found'})
        }
        const updated = await orderModel.findByIdAndUpdate(orderId, {
            status,
            $push: { statusUpdates: { status, date: Date.now() } }
        })
        res.json({success:true,message:'Status Updated'})
    } catch (error) {
        console.log(error)
        res.json({success:false,message:error.message})
    }
}
//customer cancels an order
const cancelOrder = async (req,res) =>{
    try {
        const { userId, orderId } = req.body
        const order = await orderModel.findById(orderId)
        if (!order) {
            return res.json({success:false,message:'Order not found'})
        }
        if (order.userId !== userId) {
            return res.json({success:false,message:'Order not found'})
        }
        const cancellableStatuses = ['Order Placed','Order Confirmed','Processing']
        if (!cancellableStatuses.includes(order.status)) {
            return res.json({success:false,message:'This order can no longer be cancelled.'})
        }
        const updated = await orderModel.findByIdAndUpdate(orderId, {
            status:'Cancelled',
            cancelledBy:'Customer',
            cancelledAt: Date.now(),
            $push: { statusUpdates: { status:'Cancelled', date: Date.now() } }
        }, { new:true })
        res.json({success:true,message:'Your order has been cancelled successfully.',order:updated})
    } catch (error) {
        console.log(error)
        res.json({success:false,message:error.message})
    }
}

//update advance payment for admin panel
const updateAdvancePayment = async (req,res) =>{
    try {
        const { orderId, advancePayment } = req.body
        const order = await orderModel.findById(orderId)
        if (!order) {
            return res.json({success:false,message:'Order not found'})
        }
        const amount = Number(advancePayment)
        const value = Number.isFinite(amount) && amount > 0 ? amount : 0
        const updated = await orderModel.findByIdAndUpdate(orderId, { advancePayment: value }, { new:true })
        res.json({success:true,message:'Advance Payment Saved',order:updated})
    } catch (error) {
        console.log(error)
        res.json({success:false,message:error.message})
    }
}

//delete order for admin panel (also removes its reviews)
const deleteOrder = async (req,res) =>{
    try {
        const { orderId } = req.body
        const order = await orderModel.findById(orderId)
        if (!order) {
            return res.json({success:false,message:'Order not found'})
        }
        await orderModel.findByIdAndDelete(orderId)
        const reviews = await reviewModel.find({ orderId: order.orderId })
        if (reviews.length > 0) {
            const productIds = [...new Set(reviews.map(r => r.productId))]
            await reviewModel.deleteMany({ orderId: order.orderId })
            for (const pid of productIds) {
                await recomputeProductRating(pid)
            }
        }
        res.json({success:true,message:'Order deleted successfully.'})
    } catch (error) {
        console.log(error)
        res.json({success:false,message:error.message})
    }
}

export {placeOrder,placeOrderStripe,placeOrderRazorpay,allOrders,userOrders,trackOrder,updateStatus,cancelOrder,deleteOrder,updateAdvancePayment}