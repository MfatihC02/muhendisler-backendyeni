import mongoose from 'mongoose';
const { Schema } = mongoose;

const CartItemSchema = new Schema({
    product: {
        type: Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },
    quantity: {
        type: Number,
        required: true,
        min: 1
    },
    price: {
        type: Number,
        required: true
    },
    unit: {
        type: String,
        required: true,
        enum: ['adet', 'kg', 'gram']
    }
});

const CartSchema = new Schema({
    user: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    items: [CartItemSchema],
    totalAmount: {
        type: Number,
        default: 0
    },
    lastActivity: {
        type: Date,
        default: Date.now,
        expires: 172800 // 48 saat sonra otomatik silinecek
    }
}, {
    timestamps: true
});

// Toplam tutarı hesaplama middleware
CartSchema.pre('save', function (next) {
    this.totalAmount = this.items.reduce((total, item) => {
        return total + (item.price * item.quantity);
    }, 0);
    this.lastActivity = new Date();
    next();
});

const Cart = mongoose.model('Cart', CartSchema);
export { Cart };
