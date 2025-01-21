import mongoose from 'mongoose';
const { Schema } = mongoose;

// İl kodları için enum
const VALID_STATE_CODES = ['TR-42', 'TR-06']; // Konya ve Ankara

// İl adları için enum
const VALID_CITIES = ['Konya', 'Ankara'];

const AddressSchema = new Schema({
    user: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    title: {
        type: String,
        required: true
    },
    fullName: {
        type: String,
        required: true
    },
    phone: {
        type: String,
        required: true,
        validate: {
            validator: function(v) {
                return /^[0-9]{10}$/.test(v);
            },
            message: 'Telefon numarası 10 haneli olmalıdır'
        }
    },
    city: {
        type: String,
        required: true,
        enum: {
            values: VALID_CITIES,
            message: 'Geçerli bir şehir seçiniz (Konya veya Ankara)'
        }
    },
    stateCode: {
        type: String,
        required: true,
        enum: {
            values: VALID_STATE_CODES,
            message: 'Geçerli bir il kodu giriniz (TR-42 veya TR-06)'
        },
        set: function(val) {
            // City değiştiğinde otomatik olarak stateCode'u güncelle
            if (this.city === 'Konya') return 'TR-42';
            if (this.city === 'Ankara') return 'TR-06';
            return val;
        }
    },
    district: {
        type: String,
        required: true
    },
    neighborhood: {
        type: String,
        required: true
    },
    fullAddress: {
        type: String,
        required: true
    },
    zipCode: {
        type: String,
        required: true,
        validate: {
            validator: function(v) {
                return /^[0-9]{5}$/.test(v);
            },
            message: 'Posta kodu 5 haneli olmalıdır'
        }
    },
    countryCode: {
        type: String,
        default: 'TR',
        validate: {
            validator: function(v) {
                return v === 'TR';
            },
            message: 'Şu an sadece Türkiye adresleri desteklenmektedir'
        }
    },
    isDefault: {
        type: Boolean,
        default: false
    },
    type: {
        type: String,
        enum: ['shipping', 'billing', 'both'],
        default: 'both'
    }
}, {
    timestamps: true
});

// City değiştiğinde stateCode'u otomatik güncelle
AddressSchema.pre('save', function(next) {
    if (this.city === 'Konya') {
        this.stateCode = 'TR-42';
    } else if (this.city === 'Ankara') {
        this.stateCode = 'TR-06';
    }
    next();
});

// Varsayılan adres ayarlandığında diğer varsayılan adresleri güncelle
AddressSchema.pre('save', async function(next) {
    if (this.isDefault) {
        await this.constructor.updateMany(
            { 
                user: this.user, 
                _id: { $ne: this._id }, 
                isDefault: true 
            },
            { isDefault: false }
        );
    }
    next();
});

const Address = mongoose.model('Address', AddressSchema);

export { Address, VALID_CITIES, VALID_STATE_CODES };