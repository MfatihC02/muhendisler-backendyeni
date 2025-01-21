// models/order.model.js
import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
const { Schema } = mongoose;

const OrderItemSchema = new Schema({
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
        enum: ['adet', 'kg', 'gram', 'lt']
    },
    stockReservationId: {  
        type: Schema.Types.ObjectId,
        ref: 'StockReservation',
        required: true
    }
});

// Sipariş numarası oluşturma yardımcı fonksiyonu
async function generateOrderNumber() {
    const date = new Date();
    const formattedDate = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
    const uuid = uuidv4();
    const orderNumber = `${formattedDate}-${uuid}`;
    return orderNumber;
}

const OrderSchema = new Schema({
    orderNumber: {
        type: String,
        unique: true,
        sparse: true
    },
    user: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    items: [OrderItemSchema],
    shippingAddress: {
        type: Schema.Types.ObjectId,
        ref: 'Address',
        required: true
    },
    status: {
        type: String,
        enum: [
           'CREATED',
        'PROCESSING',
        'SHIPPED',
        'DELIVERED',
        'CANCELLED',
        'PAYMENT_COMPLETED',
        'FAILED'
        ],
        default: 'PROCESSING'
    },
    totalAmount: {
        type: Number,
        required: true
    },
    paymentDetails: {
        transactionId: String,
        paymentMethod: {
            type: String,
            enum: ['credit_card', 'bank_transfer', 'other'],
            default: 'other'
        },
        status: {
            type: String,
            enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED'],
            default: 'PENDING'
        },
        paidAt: Date
    },
    shippingDetails: {
        carrier: String,
        trackingNumber: String,
        estimatedDeliveryDate: Date,
        shippedAt: Date,
        deliveredAt: Date
    },
    notes: String,
    statusHistory: [{
        status: {
            type: String,
            enum: ['CREATED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'PAYMENT_COMPLETED', 'FAILED']
        },
        timestamp: {
            type: Date,
            default: Date.now
        },
        note: String
    }]
}, {
    timestamps: true
});

// Middleware
OrderSchema.pre('save', async function (next) {
    // Status değişikliğini kaydet
    if (this.isModified('status')) {
        this.statusHistory.push({
            status: this.status,
            timestamp: new Date()
        });
    }

    // Sipariş numarası oluştur
    if (!this.orderNumber) {
        this.orderNumber = await generateOrderNumber();
    }

    next();
});

// Methods
OrderSchema.statics.getOrdersByUser = function(userId) {
    return this.find({ user: userId }).sort({ createdAt: -1 });
};

export const Order = mongoose.model('Order', OrderSchema);