import mongoose from 'mongoose';

const reviewSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },
    rating: {
        type: Number,
        required: true,
        min: 1,
        max: 5
    },
    comment: {
        type: String,
        required: true,
        minlength: 2
    },
    isVerifiedPurchase: {
        type: Boolean,
        default: false
    }
}, { 
    timestamps: true 
});

// Bir kullanıcı bir ürüne sadece bir yorum yapabilir
reviewSchema.index({ userId: 1, productId: 1 }, { unique: true });

// Ürün silindiyse ilgili yorumları da sil
reviewSchema.pre('save', async function(next) {
    try {
        const Product = mongoose.model('Product');
        const product = await Product.findById(this.productId);
        if (!product) {
            throw new Error('Ürün bulunamadı');
        }
        next();
    } catch (error) {
        next(error);
    }
});

const Review = mongoose.model('Review', reviewSchema);

export default Review;
