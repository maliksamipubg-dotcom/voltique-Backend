import{v2 as cloudinary} from "cloudinary"
import productModel from "../models/productModel.js"

const extractPublicId = (url) => {
    try {
        const match = url.match(/\/upload\/v\d+\/(.+)\.(jpg|jpeg|png|webp|gif)$/i)
        if (match) return match[1]
        const altMatch = url.match(/\/image\/upload\/(.+)$/)
        if (altMatch) return altMatch[1].split('?')[0].replace(/\.(jpg|jpeg|png|webp|gif)$/i, '')
    } catch (error) {
        return null
    }
    return null
}

const deleteCloudinaryImages = async (urls) => {
    const results = await Promise.all(
        urls.map(async (url) => {
            const publicId = extractPublicId(url)
            if (publicId) {
                try {
                    await cloudinary.uploader.destroy(publicId)
                    return true
                } catch (error) {
                    console.log(error)
                    return false
                }
            }
            return false
        })
    )
    return results
}

const uploadFilesToCloudinary = async (files) => {
    return Promise.all(
        files.map(async (item) => {
            const result = await cloudinary.uploader.upload(item.path, { resource_type: 'image' })
            return result.secure_url
        })
    )
}

const parseOptions = (raw) => {
    if (!raw) return []
    try {
        const parsed = JSON.parse(raw)
        if (!Array.isArray(parsed)) return []
        return parsed
            .filter(o => o && typeof o.name === 'string' && o.name.trim())
            .map(o => ({
                name: o.name.trim(),
                values: Array.isArray(o.values)
                    ? o.values.filter(v => typeof v === 'string' && v.trim()).map(v => v.trim())
                    : []
            }))
            .filter(o => o.values.length > 0)
    } catch (error) {
        return []
    }
}

const parseSizes = (raw) => {
    try {
        return raw ? JSON.parse(raw) : []
    } catch (error) {
        return []
    }
}

//function for add product
const addProduct = async (req,res) => {
    try {
        const { name, description, price, category, subCategory, sizes, bestseller, stock, featured } = req.body

        const uploadedFiles = req.files || []
        if (uploadedFiles.length < 1) {
            return res.json({ success: false, message: "At least 1 product image is required" })
        }
        if (uploadedFiles.length > 6) {
            return res.json({ success: false, message: "Maximum 6 product images are allowed" })
        }

        let imagesUrl = await uploadFilesToCloudinary(uploadedFiles)

        const options = parseOptions(req.body.options)
        let amperes = parseSizes(sizes)
        if (options.length > 0) {
            amperes = options[0].values
        }

        const productData = {
            name,
            description,
            category,
            price: Number(price),
            subCategory,
            bestseller: bestseller === "true" ? true : false,
            sizes: amperes,
            options,
            stock: stock || 'In Stock',
            featured: featured === "true" ? true : false,
            image: imagesUrl,
            date: Date.now()
        }
        const product = new productModel(productData);
        await product.save()
        
        res.json({ success: true, message: "Product Added" })
    } catch (error) {
        console.log(error)
        res.json({success:false,message:error.message})
        
    }
}

//function for updating product
const updateProduct = async (req,res) => {
    try {
        const { id, name, description, price, category, subCategory, sizes, bestseller, stock, featured } = req.body
        let existingImages = []
        try {
            existingImages = req.body.existingImages ? JSON.parse(req.body.existingImages) : []
        } catch (error) {
            existingImages = []
        }

        const currentProduct = await productModel.findById(id)
        if (!currentProduct) {
            return res.json({ success: false, message: "Product not found" })
        }

        const uploadedFiles = req.files || []
        let newImagesUrl = []
        if (uploadedFiles.length > 0) {
            newImagesUrl = await uploadFilesToCloudinary(uploadedFiles)
        }

        const mergedImages = [...existingImages, ...newImagesUrl].slice(0, 6)
        if (mergedImages.length < 1) {
            return res.json({ success: false, message: "At least 1 product image is required" })
        }

        const removedImages = currentProduct.image.filter((url) => !existingImages.includes(url))
        if (removedImages.length > 0) {
            await deleteCloudinaryImages(removedImages)
        }

        const options = parseOptions(req.body.options)
        let amperes = parseSizes(sizes)
        if (options.length > 0) {
            amperes = options[0].values
        }

        const updateData = {
            name,
            description,
            category,
            subCategory,
            price: Number(price),
            bestseller: bestseller === "true" ? true : false,
            sizes: amperes,
            options,
            stock: stock || 'In Stock',
            featured: featured === "true" ? true : false,
            image: mergedImages
        }
        await productModel.findByIdAndUpdate(id, updateData)
        res.json({ success: true, message: "Product Updated" })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

//function for list product
const listProducts = async (req,res) => {
    try {
        const products = await productModel.find({});
        res.json({success:true,products})
    } catch (error) {
        console.log(error)
        res.json({success:false,message:error.message})
    }
}

//function for removing product
const removeProduct = async (req,res) => {
    try {
        const product = await productModel.findById(req.body.id)
        if (!product) {
            return res.json({ success: false, message: "Product not found" })
        }
        if (product.image && product.image.length > 0) {
            await deleteCloudinaryImages(product.image)
        }
        await productModel.findByIdAndDelete(req.body.id)
        res.json({success:true,message:"Product Removed"})

    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

//function for single product info
const singleProduct = async (req,res) => {
    try {
        const { productId } = req.body
        const product = await productModel.findById(productId)
        res.json({success:true,product})
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

export {addProduct,listProducts,removeProduct,singleProduct,updateProduct}
