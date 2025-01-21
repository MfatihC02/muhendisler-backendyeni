// models/stock.model.js
import mongoose from 'mongoose';
import StockReservation from './stockReservation.model.js';
const { Schema } = mongoose;

const StockSchema = new Schema({
    product: {
        type: Schema.Types.ObjectId,
        ref: 'Product',
        required: true,
        unique: true
    },
    productType: {
        type: String,
        enum: ['seed', 'seedling', 'fertilizer', 'agriculturalTool'],
        required: true
    },
    quantity: {
        type: Number,
        required: true,
        min: 0,
        default: 0
    },
    reservedQuantity: {
        type: Number,
        default: 0,
        min: 0
    },
    unit: {
        type: String,
        required: true,
        enum: ['adet', 'kg', 'gram', 'lt'],
        validate: {
            validator: function (unit) {
                const validUnits = {
                    seed: ['gram', 'kg', 'adet'],
                    seedling: ['adet'],
                    fertilizer: ['kg', 'lt'],
                    agriculturalTool: ['adet']
                };
                return validUnits[this.productType].includes(unit);
            },
            message: 'Geçersiz birim türü'
        }
    },
    lowStockThreshold: {
        type: Number,
        required: true,
        validate: {
            validator: function (value) {
                return value <= this.quantity;
            },
            message: 'Düşük stok eşiği, toplam stok miktarından büyük olamaz'
        }
    },
    storageConditions: {
        temperature: {
            min: Number,
            max: Number,
            unit: {
                type: String,
                enum: ['C', 'F'],
                default: 'C'
            }
        },
        humidity: {
            min: Number,
            max: Number,
            unit: {
                type: String,
                enum: ['%'],
                default: '%'
            }
        }
    },
    movements: [{
        type: { 
            type: String, 
            enum: ['add', 'remove'], 
            required: true 
        },
        quantity: { 
            type: Number, 
            required: true 
        },
        reason: { 
            type: String, 
            enum: ['purchase', 'return', 'correction', 'sale', 'damage', 'expired'],
            required: true 
        },
        note: String,
        date: { 
            type: Date, 
            default: Date.now 
        },
        user: { 
            type: Schema.Types.ObjectId, 
            ref: 'User', 
            required: true 
        }
    }],
    location: {
        warehouse: String,
        section: String,
        shelf: String
    },
    batchInfo: {
        batchNumber: String,
        productionDate: Date,
        expiryDate: Date
    }
}, {
    timestamps: true
});

// Virtuals
StockSchema.virtual('availableQuantity').get(function () {
    return this.quantity - this.reservedQuantity;
});

StockSchema.virtual('isLowStock').get(function () {
    return this.availableQuantity <= this.lowStockThreshold;
});

// Middleware
StockSchema.pre('save', async function (next) {
    // Stok düşük seviye kontrolü
    if (this.isLowStock) {
        global.io.emit('lowStock', {
            productId: this.product,
            productType: this.productType,
            quantity: this.availableQuantity,
            threshold: this.lowStockThreshold
        });
    }
    next();
});

// Methods
StockSchema.methods.syncReservedQuantity = async function() {
    const session = await mongoose.startSession();
    try {
        session.startTransaction();
        
        const activeReservations = await StockReservation.find({
            product: this.product,
            status: { $in: ['CART', 'CHECKOUT', 'CONFIRMED'] }
        }).session(session);
        
        this.reservedQuantity = activeReservations.reduce(
            (total, res) => total + res.quantity, 
            0
        );
        
        await this.save({ session });
        await session.commitTransaction();
        
        return this.reservedQuantity;
    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
};

StockSchema.methods.getAvailableQuantity = async function () {
    // Önce senkronizasyon yap
    await this.syncReservedQuantity();
    
    // Güncel değeri döndür
    return this.quantity - this.reservedQuantity;
};

StockSchema.methods.canReserve = async function (requestedQuantity) {
    const availableQuantity = await this.getAvailableQuantity();
    return availableQuantity >= requestedQuantity;
};

StockSchema.methods.createCartReservation = async function (quantity, userId) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        // Stok kontrolü
        if (!await this.canReserve(quantity)) {
            throw new Error('Yetersiz stok');
        }

        // Cart rezervasyonu oluştur
        const reservation = await StockReservation.createCartReservation(
            this._id,
            userId,
            quantity
        );

        // Stock modelinde reservedQuantity'yi güncelle
        await Stock.findByIdAndUpdate(
            this._id,
            { $inc: { reservedQuantity: quantity } },
            { session }
        );

        await session.commitTransaction();
        return reservation;
    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
};

StockSchema.methods.createCheckoutReservation = async function (quantity, userId) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        // Stok kontrolü
        if (!await this.canReserve(quantity)) {
            throw new Error('Yetersiz stok');
        }

        // Checkout rezervasyonu oluştur
        const reservation = await StockReservation.createCheckoutReservation(
            this._id,
            userId,
            quantity
        );

        await session.commitTransaction();
        return reservation;
    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
};

// Statics
StockSchema.statics.getProductStock = async function (productId) {
    return this.findOne({ product: productId }).populate('product', 'name slug').exec();
};

// Event listeners
StockSchema.post('save', function (doc) {
    if (doc.isLowStock) {
        global.io.emit('lowStock', {
            stockId: doc._id,
            productId: doc.product,
            availableQuantity: doc.availableQuantity,
            threshold: doc.lowStockThreshold
        });
    }
});

export const Stock = mongoose.model('Stock', StockSchema);