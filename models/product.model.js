import mongoose from 'mongoose';
import specifications from './specifications.model.js';
import mongoosePaginate from 'mongoose-paginate-v2';

const { Schema } = mongoose;

const ProductSchema = new Schema({
    name: {
        type: String,
        required: true
    },
    slug: {
        type: String,
        unique: true
    },
    sku: {
        type: String,
        unique: true
    },
    description: {
        meta: {
            type: String,
            required: true,
            maxlength: 160,  // Google meta description için ideal uzunluk
            minlength: 50    // Minimum anlamlı açıklama uzunluğu
        },
        detailed: {
            type: String,
            required: true,
            minlength: 100   // Minimum detaylı açıklama uzunluğu
        },
        keywords: {
            type: [String],  // Dizi olarak anahtar kelimeler
            required: true,
            validate: {
                validator: function(keywords) {
                    return keywords.length >= 3 && keywords.length <= 10; // Min 3, max 10 anahtar kelime
                },
                message: 'En az 3, en fazla 10 anahtar kelime girilmelidir.'
            }
        }
    },
    category: {
        type: Schema.Types.ObjectId,
        ref: 'Category',
        required: true
    },
    productType: {
        type: String,
        enum: ['seed', 'seedling', 'fertilizer', 'agriculturalTool'],
        required: true
    },
    brand: {
        type: String,
        required: true
    },
    specifications: {
        type: Schema.Types.Mixed,
        validate: {
            validator: function (specs) {
                return validateSpecifications(this.productType, specs);
            }
        }
    },
    price: {
        current: {
            type: Number,
            required: true
        },
        discount: {
            type: Number,
            default: 0
        },
        discountEndDate: Date
    },
    stock: {
        quantity: {
            type: Number,
            required: false,
            min: 0,
            default: null
        },
        unit: {
            type: String,
            required: false,
            enum: ['adet', 'kg', 'gram'],
            default: null
        },
        lowStockAlert: {
            type: Number,
            default: null
        }
    },
    images: [{
        url: String,
        alt: String,
        order: Number,
        publicId: String
    }],
    status: {
        type: String,
        enum: ['active', 'inactive', 'draft', 'outOfStock'],
        default: 'draft'
    }
}, {
    timestamps: true
});

ProductSchema.plugin(mongoosePaginate);

// Model'i oluştur
mongoose.model('Product', ProductSchema);

// Sadece model tanımı için gerekli olan fonksiyonları export et
export function validateSpecifications(productType, specs) {
    return specs && specifications[productType];
}
