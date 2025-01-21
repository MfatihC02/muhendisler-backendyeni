// models/stockReservation.model.js
import mongoose from 'mongoose';
const { Schema } = mongoose;

// TTL süreleri (milisaniye cinsinden)
const TTL_DURATIONS = {
    CART: 24 * 60 * 60 * 1000,      // 24 saat
    CHECKOUT: 60 * 60 * 1000,        // 1 saat
    CONFIRMED: 7 * 24 * 60 * 60 * 1000, // 7 gün
    CANCELLED: 24 * 60 * 60 * 1000   // 24 saat
};

const StockReservationSchema = new Schema({
    product: {
        type: Schema.Types.ObjectId,
        ref: 'Product',
        required: true,
        index: true
    },
    user: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    quantity: {
        type: Number,
        required: true,
        min: [1, 'Miktar en az 1 olmalıdır'],
        validate: {
            validator: Number.isInteger,
            message: 'Miktar tam sayı olmalıdır'
        }
    },
    status: {
        type: String,
        enum: ['CART', 'CHECKOUT', 'CONFIRMED', 'CANCELLED'],
        default: 'CART',
        index: true
    },
    expiresAt: {
        type: Date,
        required: function() {
            // Sadece CART ve CHECKOUT durumlarında zorunlu
            return ['CART', 'CHECKOUT'].includes(this.status);
        },
        validate: {
            validator: function(value) {
                // CONFIRMED veya CANCELLED durumunda validasyon yapma
                if (!['CART', 'CHECKOUT'].includes(this.status)) {
                    return true;
                }
                // Diğer durumlarda tarih kontrolü yap
                return value > new Date();
            },
            message: 'Geçerlilik süresi gelecekte bir tarih olmalıdır'
        }
    },
    ttlDate: {
        type: Date,
        index: true
    }
}, {
    timestamps: true
});

// Virtual Fields
StockReservationSchema.virtual('isExpired').get(function() {
    if (!this.expiresAt) return false;
    return new Date() > this.expiresAt;
});

StockReservationSchema.virtual('remainingTime').get(function() {
    if (!this.expiresAt) return 0;
    return Math.max(0, this.expiresAt - new Date());
});

// Instance Methods
StockReservationSchema.methods.extend = async function(duration) {
    if (!['CART', 'CHECKOUT'].includes(this.status)) {
        throw new Error('Sadece geçici rezervasyonlar uzatılabilir');
    }
    
    this.expiresAt = new Date(Date.now() + duration);
    return this.save();
};

StockReservationSchema.methods.convertToCheckout = async function() {
    if (this.status !== 'CART') {
        throw new Error('Sadece sepetteki rezervasyonlar checkout durumuna geçebilir');
    }
    
    this.status = 'CHECKOUT';
    // Checkout için yeni bir süre (örneğin 15 dakika)
    this.expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    return this.save();
};

StockReservationSchema.methods.confirm = async function(session) {
    // Eğer zaten CONFIRMED ise başarılı dön
    if (this.status === 'CONFIRMED') {
        return this;
    }

    // Sadece CART veya CHECKOUT durumundaki rezervasyonlar onaylanabilir
    if (!['CART', 'CHECKOUT'].includes(this.status)) {
        throw new Error(`Geçersiz rezervasyon durumu: ${this.status}. Sadece CART veya CHECKOUT durumundaki rezervasyonlar onaylanabilir.`);
    }
    
    const oldStatus = this.status;
    this.status = 'CONFIRMED';
    this.expiresAt = null;  // Onaylanmış rezervasyonların süresi olmaz
    
    // Session varsa kullan
    const savedReservation = session ? 
        await this.save({ session }) : 
        await this.save();

    // Log
    console.log(`Rezervasyon onaylandı: ${this._id}, Eski durum: ${oldStatus}, Yeni durum: ${this.status}`);
    
    return savedReservation;
};

StockReservationSchema.methods.cancel = async function(session) {
    if (this.status === 'CANCELLED') {
        throw new Error('Rezervasyon zaten iptal edilmiş');
    }

    const oldStatus = this.status;
    this.status = 'CANCELLED';
    this.expiresAt = null;  // İptal edilmiş rezervasyonların süresi olmaz

    // Eğer transaction session varsa onu kullan
    if (session) {
        const Stock = mongoose.model('Stock');
        const stock = await Stock.findOne({ product: this.product }).session(session);
        
        if (!stock) {
            throw new Error('Stok bulunamadı');
        }

        // Stok miktarını güncelle
        stock.reservedQuantity = Math.max(0, stock.reservedQuantity - this.quantity);
        await stock.save({ session });

        return this.save({ session });
    }
    return this.save();
};

// Static Methods
StockReservationSchema.statics.createCartReservation = async function(productId, userId, quantity) {
    const expiresAt = new Date(Date.now() + (60 * 60 * 1000)); // 1 saat

    return this.create({
        product: productId,
        user: userId,
        quantity,
        status: 'CART',
        expiresAt
    });
};

StockReservationSchema.statics.findActiveReservations = async function(productId) {
    return this.find({
        product: productId,
        status: { $in: ['CART', 'CHECKOUT'] },
        expiresAt: { $gt: new Date() }
    }).exec();
};

StockReservationSchema.statics.findUserActiveReservations = async function(userId) {
    return this.find({
        user: userId,
        status: { $in: ['CART', 'CHECKOUT'] },
        expiresAt: { $gt: new Date() }
    }).exec();
};

// Middleware
StockReservationSchema.pre('save', function(next) {
    // Mevcut expiresAt logic'i
    if (this.status === 'CONFIRMED' || this.status === 'CANCELLED') {
        this.expiresAt = null;
    }

    // TTL tarihini güncelle
    this.ttlDate = new Date(Date.now() + TTL_DURATIONS[this.status]);
    
    next();
});

// Post-remove middleware for updating stock
StockReservationSchema.post('remove', async function(doc) {
    if (['CART', 'CHECKOUT'].includes(doc.status)) {
        const session = await mongoose.startSession();
        try {
            session.startTransaction();
            
            const Stock = mongoose.model('Stock');
            await Stock.findOneAndUpdate(
                { product: doc.product },
                { $inc: { reservedQuantity: -doc.quantity } },
                { session }
            );
            
            await session.commitTransaction();
        } catch (error) {
            await session.abortTransaction();
            throw error;
        } finally {
            session.endSession();
        }
    }
});


const StockReservation = mongoose.model('StockReservation', StockReservationSchema);
export default StockReservation;
