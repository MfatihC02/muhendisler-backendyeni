import mongoose from 'mongoose';
import mongoosePaginate from 'mongoose-paginate-v2';

const { Schema } = mongoose;

const CategorySchema = new Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    slug: {
        type: String,        // SEO dostu URL
        unique: true
    },
    description: String,     // Kategori açıklaması
    parent: {
        type: Schema.Types.ObjectId,  // Üst kategori
        ref: 'Category',
        default: null
    },
    ancestors: [{            // Breadcrumb için üst kategoriler
        _id: Schema.Types.ObjectId,
        name: String,
        slug: String
    }],
    level: {
        type: Number,        // Kategori derinliği
        default: 0
    },
    isActive: {
        type: Boolean,       // Kategori durumu
        default: true
    },
    order: {
        type: Number,        // Sıralama
        default: 0
    },
    seasonalProducts: {      // Mevsimlik ürünler kategorisi mi?
        type: Boolean,
        default: false
    },
    icon: String,           // Kategori ikonu
    image: String,          // Kategori görseli
    subCategoryCount: {     // Alt kategori sayısı
        type: Number,
        default: 0
    },
    productCount: {         // Ürün sayısı
        type: Number,
        default: 0
    },
    metadata: {             // SEO bilgileri
        title: String,
        description: String,
        keywords: [String]
    }
});

CategorySchema.plugin(mongoosePaginate);

// category.model.js
const Category = mongoose.model('Category', CategorySchema);
export { Category };