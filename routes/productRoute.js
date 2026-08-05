import express from 'express'
import {addProduct,listProducts,removeProduct,singleProduct,updateProduct} from '../controllers/productController.js'
import upload from '../middleware/multer.js';
import adminAuth from '../middleware/adminAuth.js';

const productRouter = express.Router();

productRouter.post('/add',adminAuth,upload.array('images',6),addProduct);
productRouter.post('/update',adminAuth,upload.array('images',6),updateProduct);
productRouter.post('/remove',removeProduct);
productRouter.post('/single',singleProduct);
productRouter.get('/list',listProducts)

export default productRouter