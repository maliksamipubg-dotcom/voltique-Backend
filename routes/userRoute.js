import express from 'express';
import { loginUser,registerUser,adminLogin,getProfile,updateProfile,changePassword,googleLogin } from '../controllers/userController.js';
import authUser from '../middleware/auth.js';

const userRouter = express.Router();

userRouter.post('/register',registerUser)
userRouter.post('/login',loginUser)
userRouter.post('/google-login',googleLogin)
userRouter.post('/admin',adminLogin)
userRouter.post('/profile',authUser,getProfile)
userRouter.post('/update-profile',authUser,updateProfile)
userRouter.post('/change-password',authUser,changePassword)

export default userRouter;