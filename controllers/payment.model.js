// models/payment.model.js
import mongoose from 'mongoose';
import crypto from 'crypto';
const { Schema } = mongoose;

// Şifreleme için yardımcı fonksiyonlar
const ENCRYPTION_KEY = process.env.CARD_ENCRYPTION_KEY; // 32 byte key
const IV_LENGTH = 16; // AES için gerekli

const encrypt = (text) => {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    return {
        iv: iv.toString('hex'),
        encrypted: encrypted,
        authTag: authTag.toString('hex')
    };
};

const decrypt = (encrypted, iv, authTag) => {
    const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(ENCRYPTION_KEY, 'hex'), Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
};

// Kart numarası maskeleme fonksiyonu
const maskCardNumber = (cardNumber) => {
    if (!cardNumber) return '';
    return `****${cardNumber.slice(-4)}`;
};

// Email maskeleme fonksiyonu
const maskEmail = (email) => {
    if (!email) return '';
    const [name, domain] = email.split('@');
    return `${name.charAt(0)}****${name.charAt(name.length - 1)}@${domain}`;
};

// Telefon maskeleme fonksiyonu
const maskPhone = (phone) => {
    if (!phone) return '';
    return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
};

// Adres maskeleme fonksiyonu
const maskAddress = (address) => {
    if (!address) return '';
    const words = address.split(' ');
    return words.map(word =>
        word.length > 3 ? `${word.slice(0, 2)}**${word.slice(-1)}` : word
    ).join(' ');
};

// HTML yanıtını temizleyen ve formatlayan yardımcı fonksiyon
const formatHtmlResponse = (html) => {
    if (!html) return html;
    // Gereksiz boşlukları ve satır sonlarını temizle
    return html.replace(/\s+/g, ' ').trim();
};

const PaymentSchema = new Schema({
    orderId: {
        type: Schema.Types.ObjectId,
        ref: 'Order',
        required: true
    },
    merchantOrderId: {
        type: String,
        required: true,
        index: true
    },
    bankOrderId: {
        type: String,
        sparse: true,
        index: true
    },
    CardNumber: {
        type: String,
        required: true,
        select: false,
        set: function (value) {
            if (!value) return value;
            const encrypted = encrypt(value);
            this._cardNumber_iv = encrypted.iv;
            this._cardNumber_tag = encrypted.authTag;
            return encrypted.encrypted;
        },
        get: function (value) {
            if (!value) return value;
            try {
                const decrypted = decrypt(value, this._cardNumber_iv, this._cardNumber_tag);
                return maskCardNumber(decrypted);
            } catch (error) {
                console.error('Kart numarası çözülemedi:', error);
                return '[Protected]';
            }
        }
    },
    CardHolderName: {
        type: String,
        required: true,
        set: function (value) {
            if (!value) return value;
            const encrypted = encrypt(value);
            this._cardHolderName_iv = encrypted.iv;
            this._cardHolderName_tag = encrypted.authTag;
            return encrypted.encrypted;
        },
        get: function (value) {
            if (!value) return value;
            try {
                return decrypt(value, this._cardHolderName_iv, this._cardHolderName_tag);
            } catch (error) {
                console.error('Kart sahibi adı çözülemedi:', error);
                return '[Protected]';
            }
        }
    },
    CardExpireDateMonth: {
        type: String,
        required: true,
        length: 2,
        validate: {
            validator: function (v) {
                return /^(0[1-9]|1[0-2])$/.test(v);
            },
            message: 'Geçersiz ay formatı'
        }
    },
    CardExpireDateYear: {
        type: String,
        required: true,
        length: 2,
        validate: {
            validator: function (v) {
                return /^\d{2}$/.test(v);
            },
            message: 'Geçersiz yıl formatı'
        }
    },
    CardType: {
        type: String,
        enum: ['TROY', 'VISA', 'MASTERCARD'],
        required: true
    },
    status: {
        type: String,
        enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED'],
        default: 'PENDING'
    },
    Amount: {
        type: Number,
        required: true,
        min: 0
    },
    DisplayAmount: {
        type: Number,
        required: true,
        min: 0
    },
    CurrencyCode: {
        type: String,
        default: '0949',
        required: true
    },
    TransactionType: {
        type: String,
        enum: ['Sale', 'Void', 'Refund'],
        default: 'Sale',
        required: true
    },
    TransactionSecurity: {
        type: String,
        enum: ['3', '0'],
        default: '3',
        required: true
    },
    InstallmentCount: {
        type: Number,
        default: 0,
        min: 0,
        max: 12
    },
    statusHistory: [{
        status: String,
        note: String,
        timestamp: {
            type: Date,
            default: Date.now
        }
    }],
    provider: {
        type: String,
        default: 'KUVEYTTURK'
    },
    providerTransactionId: String,
    errorCode: String,
    errorMessage: String,
    threeDSecure: {
        status: {
            type: String,
            enum: ['PENDING', 'SUCCESS', 'FAILED'],
            default: 'PENDING'
        },
        responseCode: String,
        responseMessage: String,
        md: String
    },
    raw: {
        request: {
            type: Object,
            set: function (value) {
                if (!value) return value;
                // CVV ve diğer hassas verileri temizle
                const cleanedValue = { ...value };
                if (cleanedValue.CardCVV2) delete cleanedValue.CardCVV2;
                if (cleanedValue.CardNumber) cleanedValue.CardNumber = maskCardNumber(cleanedValue.CardNumber);

                // XML veya HTML içeren string'leri formatla
                if (typeof cleanedValue === 'string') {
                    return formatHtmlResponse(cleanedValue);
                }
                return cleanedValue;
            }
        },
        response: {
            type: Object,
            set: function (value) {
                if (!value) return value;

                // String (HTML/XML) yanıt ise formatla
                if (typeof value === 'string') {
                    return formatHtmlResponse(value);
                }

                // Object ise içindeki string değerleri formatla
                const formattedResponse = { ...value };
                Object.keys(formattedResponse).forEach(key => {
                    if (typeof formattedResponse[key] === 'string') {
                        formattedResponse[key] = formatHtmlResponse(formattedResponse[key]);
                    }
                });

                return formattedResponse;
            }
        }
    },
    CardHolderData: {
        BillAddrCity: String,
        BillAddrCountry: String,
        BillAddrLine1: {
            type: String,
            set: function (value) {
                if (!value) return value;
                const encrypted = encrypt(value);
                this._address_iv = encrypted.iv;
                this._address_tag = encrypted.authTag;
                return encrypted.encrypted;
            },
            get: function (value) {
                if (!value) return value;
                try {
                    const decrypted = decrypt(value, this._address_iv, this._address_tag);
                    return maskAddress(decrypted);
                } catch (error) {
                    return '[Protected]';
                }
            }
        },
        BillAddrPostCode: String,
        BillAddrState: String,
        Email: {
            type: String,
            set: function (value) {
                if (!value) return value;
                const encrypted = encrypt(value);
                this._email_iv = encrypted.iv;
                this._email_tag = encrypted.authTag;
                return encrypted.encrypted;
            },
            get: function (value) {
                if (!value) return value;
                try {
                    const decrypted = decrypt(value, this._email_iv, this._email_tag);
                    return maskEmail(decrypted);
                } catch (error) {
                    return '[Protected]';
                }
            }
        },
        MobilePhone: {
            Cc: String,
            Subscriber: {
                type: String,
                set: function (value) {
                    if (!value) return value;
                    const encrypted = encrypt(value);
                    this._phone_iv = encrypted.iv;
                    this._phone_tag = encrypted.authTag;
                    return encrypted.encrypted;
                },
                get: function (value) {
                    if (!value) return value;
                    try {
                        const decrypted = decrypt(value, this._phone_iv, this._phone_tag);
                        return maskPhone(decrypted);
                    } catch (error) {
                        return '[Protected]';
                    }
                }
            }
        }
    }
}, {
    timestamps: true
});

// Status history ekleme metodu
PaymentSchema.methods.addStatusHistory = async function (status, note = '') {
    this.statusHistory.push({ status, note });
    this.status = status;
    return this.save();
};

// Status güncelleme metodu
PaymentSchema.methods.updateStatus = async function (newStatus, note = '') {
    return this.addStatusHistory(newStatus, note);
};

// Ödeme durumunu kontrol etme metodu
PaymentSchema.methods.isCompleted = function () {
    return this.status === 'COMPLETED';
};

// Ödemenin iptal edilebilir olup olmadığını kontrol etme
PaymentSchema.methods.canBeRefunded = function () {
    return this.status === 'COMPLETED' &&
        !this.statusHistory.some(h => h.status === 'REFUNDED');
};

// İndeksler
PaymentSchema.index({ merchantOrderId: 1 }, { unique: true });
PaymentSchema.index({ bankOrderId: 1 }, { sparse: true });

// Statik metodlar
PaymentSchema.statics.findByOrderId = function (orderId) {
    return this.findOne({ orderId });
};

PaymentSchema.statics.findByTransactionId = function (transactionId) {
    return this.findOne({ providerTransactionId: transactionId });
};

PaymentSchema.statics.findByMerchantOrderId = function (merchantOrderId) {
    return this.findOne({ merchantOrderId });
};

PaymentSchema.statics.findByBankOrderId = function (bankOrderId) {
    return this.findOne({ bankOrderId });
};

// Pre-save middleware ekle
PaymentSchema.pre('save', function (next) {
    // Raw response'daki hassas verileri temizle
    if (this.raw && this.raw.response) {
        const cleanedResponse = { ...this.raw.response };
        // Hassas verileri temizle
        if (cleanedResponse.CardNumber) {
            cleanedResponse.CardNumber = maskCardNumber(cleanedResponse.CardNumber);
        }
        this.raw.response = cleanedResponse;
    }
    next();
});

export const Payment = mongoose.model('Payment', PaymentSchema);
