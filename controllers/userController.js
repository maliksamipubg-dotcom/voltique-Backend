import userModel from "../models/userModel.js";
import orderModel from "../models/orderModel.js";
import validator from "validator";
import bcrypt from "bcrypt"
import jwt from 'jsonwebtoken'

const createToken = (id) => {
    return jwt.sign({id},process.env.JWT_SECRET)
}

const isValidName = (name) => {
    return typeof name === 'string' && /^[A-Za-z ]{3,}$/.test(name.trim());
}

const isValidPhone = (phone) => {
    if (!phone) return true;
    const cleaned = String(phone).replace(/[\s-]/g, '');
    return /^03\d{9}$/.test(cleaned) || /^\+923\d{8}$/.test(cleaned) || /^923\d{8}$/.test(cleaned);
}

//Route for getting logged in user profile
const getProfile = async (req,res) => {
    try {
        const {userId} = req.body
        const user = await userModel.findById(userId)
        if (!user) {
            return res.json({success:false, message:"User not found"})
        }
        const orderCount = await orderModel.countDocuments({userId})
        const createdAt = user._id.getTimestamp ? user._id.getTimestamp() : new Date()
        res.json({
            success:true,
            user:{
                _id: user._id,
                name: user.name,
                email: user.email,
                phone: user.phone || '',
                photoURL: user.photoURL || '',
                createdAt: createdAt
            },
            orderCount
        })
    } catch (error) {
        console.log(error);
        res.json({success:false,message:error.message})
    }
}

//Route for updating logged in user profile
const updateProfile = async (req,res) => {
    try {
        const {userId, name, phone} = req.body
        const updateData = {}
        if (name !== undefined) {
            if (!isValidName(name)) {
                return res.json({success:false, message:"Please enter a valid name"})
            }
            updateData.name = name.trim()
        }
        if (phone !== undefined) {
            const cleaned = String(phone).replace(/[\s-]/g, '')
            if (cleaned && !isValidPhone(cleaned)) {
                return res.json({success:false, message:"Please enter a valid Pakistani mobile number."})
            }
            updateData.phone = cleaned
        }
        if (Object.keys(updateData).length === 0) {
            return res.json({success:false, message:"Nothing to update"})
        }
        const updatedUser = await userModel.findByIdAndUpdate(userId, updateData, {new:true})
        res.json({
            success:true,
            message:"Profile updated successfully",
            user:{
                _id: updatedUser._id,
                name: updatedUser.name,
                email: updatedUser.email,
                phone: updatedUser.phone || ''
            }
        })
    } catch (error) {
        console.log(error);
        res.json({success:false,message:error.message})
    }
}

//Route for changing user password
const changePassword = async (req,res) => {
    try {
        const {userId, oldPassword, newPassword} = req.body
        if (!oldPassword || !newPassword) {
            return res.json({success:false, message:"Please fill all fields"})
        }
        const user = await userModel.findById(userId)
        if (!user) {
            return res.json({success:false, message:"User not found"})
        }
        if (!user.password) {
            return res.json({success:false, message:"Google sign-in accounts don't use passwords. Please sign in with Google."})
        }
        const isMatch = await bcrypt.compare(oldPassword, user.password)
        if (!isMatch) {
            return res.json({success:false, message:"Old password is incorrect."})
        }
        if (newPassword.length < 8) {
            return res.json({success:false, message:"Password must be at least 8 characters"})
        }
        if (!/[A-Z]/.test(newPassword)) {
            return res.json({success:false, message:"Password must include an uppercase letter"})
        }
        if (!/[a-z]/.test(newPassword)) {
            return res.json({success:false, message:"Password must include a lowercase letter"})
        }
        if (!/[0-9]/.test(newPassword)) {
            return res.json({success:false, message:"Password must include a number"})
        }
        if (!/[!@#$%^&*(),.?":{}|<>]/.test(newPassword)) {
            return res.json({success:false, message:"Password must include a special character"})
        }
        const salt = await bcrypt.genSalt(10)
        const hashedPassword = await bcrypt.hash(newPassword, salt)
        await userModel.findByIdAndUpdate(userId, {password: hashedPassword})
        res.json({success:true, message:"Password changed successfully."})
    } catch (error) {
        console.log(error);
        res.json({success:false,message:error.message})
    }
}
//Route for user login
const loginUser = async (req,res) => {
    try {
        const {email,password} = req.body;

        const user = await userModel.findOne({email});
        if (!user) {
            return res.json({success:false, message:"User doesn't exists"}) 
        }

        if (!user.password) {
            return res.json({success:false, message:"This account uses Google sign-in. Please sign in with Google."})
        }

        const isMatch = await bcrypt.compare(password,user.password);

        if (isMatch) {
            const token = createToken(user._id)
            res.json({success:true,token})
        }
        else{
            res.json({success:false, message:'Invalid credentials'})
        }
    } catch (error) {
        console.log(error);
        res.json({success:false,message:error.message})
    }
}

//Route for user register
const registerUser = async (req,res) => {
    try {
        const {name, email, password} = req.body;

        //Checking user exists or not
        const exists = await userModel.findOne({email});
        if (exists) {
            return res.json({success:false, message:"User already exists"})
        }
        // validating email format and strong password
        if (!validator.isEmail(email)) {
            return res.json({success:false, message:"Please enter a valid email"})
        }
        if (password.length < 8) {
            return res.json({success:false, message:"Please enter a strong password"})
        }

        //Hashing user password
        const salt = await bcrypt.genSalt(10)
        const hashedPassword = await bcrypt.hash(password,salt)

        const newUser = new userModel({
            name,
            email,
            password:hashedPassword
        })

        const user = await newUser.save()
        const token = createToken(user._id)
        res.json({success:true,token})
    } catch (error) {
        console.log(error);
        res.json({success:false,message:error.message})
        
    }
}

//Route for Google sign-in (Firebase)
const googleLogin = async (req,res) => {
    try {
        const {displayName, email, photoURL, uid} = req.body;

        if (!email || !uid) {
            return res.json({success:false, message:"Google sign-in requires an email and a user ID"})
        }

        //Find existing user by email to avoid creating duplicates
        let user = await userModel.findOne({email});

        if (!user) {
            //New Google user - create account (no password needed)
            user = new userModel({
                name: displayName || email.split('@')[0],
                email,
                photoURL: photoURL || '',
                googleId: uid,
                password: ''
            })
            await user.save()
        } else {
            //Existing user - attach Google details if missing
            let updated = false
            if (!user.googleId) {
                user.googleId = uid
                updated = true
            }
            if (!user.photoURL && photoURL) {
                user.photoURL = photoURL
                updated = true
            }
            if (updated) {
                await user.save()
            }
        }

        const token = createToken(user._id)
        res.json({
            success:true,
            token,
            user:{
                _id: user._id,
                name: user.name,
                email: user.email,
                phone: user.phone || '',
                photoURL: user.photoURL || '',
                googleId: user.googleId || ''
            }
        })
    } catch (error) {
        console.log(error);
        res.json({success:false,message:error.message})
    }
}

//Route for admin login
const adminLogin = async (req,res) => {
    try {
        const {email,password} = req.body

        if(email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD){
            const token = jwt.sign(email+password,process.env.JWT_SECRET);
            res.json({success:true,token})
        }
        else{
            res.json({success:false, message:"Invalid credentials"})
        }
    } catch (error) {
        console.log(error);
        res.json({success:false,message:error.message})
    }
}

export { loginUser,registerUser,adminLogin,getProfile,updateProfile,changePassword,googleLogin}