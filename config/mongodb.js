import mongoose from "mongoose";

const connectDB = async () => {
    mongoose.connection.on('connected', () => {
        console.log("DB Connected");
    });

    mongoose.connection.on('error', (err) => {
        console.log("DB Connection Error:", err.message);
    });

    try {
        await mongoose.connect(`${process.env.MONGODB_URI}/e-commerce`)
    } catch (error) {
        console.log("Failed to connect to DB:", error.message);
    }
}
export default connectDB;
