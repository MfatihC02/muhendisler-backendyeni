import mongoose from 'mongoose';
import slugify from 'slugify';

const Product = mongoose.model('Product');

// Slug oluşturma fonksiyonu - Güvenlik kontrolleri eklendi
export const createSlug = async (name) => {
    // Name parametresinin varlığını ve tipini kontrol et
    if (!name) {
        throw new Error('Ürün adı zorunludur');
    }

    if (typeof name !== 'string') {
        throw new Error('Ürün adı string tipinde olmalıdır');
    }

    // Boş string veya sadece boşluk karakteri kontrolü
    if (!name.trim()) {
        throw new Error('Ürün adı boş olamaz');
    }

    try {
        let slug = slugify(name.trim(), {
            lower: true,
            strict: true,
            trim: true,
            locale: 'tr' // Türkçe karakterler için
        });

        // Slug benzersizlik kontrolü
        let counter = 0;
        let uniqueSlug = slug;
        while (await Product.exists({ slug: uniqueSlug })) {
            counter++;
            uniqueSlug = `${slug}-${counter}`;
        }

        return uniqueSlug;
    } catch (error) {
        throw new Error(`Slug oluşturma hatası: ${error.message}`);
    }
};

// SKU oluşturma fonksiyonu - Hata kontrolleri eklendi
export const generateSKU = async (productType) => {
    if (!productType) {
        throw new Error('Ürün tipi zorunludur');
    }

    // Ürün tipi prefix'leri
    const typePrefix = {
        seed: 'SD',
        seedling: 'SL',
        fertilizer: 'FR',
        agriculturalTool: 'AT'
    };

    if (!typePrefix[productType]) {
        throw new Error('Geçersiz ürün tipi');
    }

    try {
        // Son eklenen ürünü bul
        const lastProduct = await Product.findOne({ productType })
            .sort({ createdAt: -1 })
            .select('sku');

        let sequence = 1;
        if (lastProduct && lastProduct.sku) {
            // Son SKU'dan sequence numarasını çıkar
            const lastSequence = parseInt(lastProduct.sku.slice(-5));
            if (!isNaN(lastSequence)) {
                sequence = lastSequence + 1;
            }
        }

        // SKU formatı: XX-YYYYMMDD-NNNNN
        const date = new Date();
        const dateStr = date.getFullYear().toString() +
            String(date.getMonth() + 1).padStart(2, '0') +
            String(date.getDate()).padStart(2, '0');

        return `${typePrefix[productType]}-${dateStr}-${String(sequence).padStart(5, '0')}`;
    } catch (error) {
        throw new Error(`SKU oluşturma hatası: ${error.message}`);
    }
};

// Fiyat hesaplama fonksiyonu - Tip kontrolleri eklendi
export const calculateDiscountedPrice = (price, discount) => {
    if (typeof price !== 'number' || price < 0) {
        throw new Error('Geçersiz fiyat değeri');
    }

    if (!discount) return price;

    if (typeof discount !== 'number' || discount < 0 || discount > 100) {
        throw new Error('Geçersiz indirim değeri');
    }

    return Number((price - (price * (discount / 100))).toFixed(2));
};

// Stok kontrol fonksiyonu - Güvenlik kontrolleri eklendi
export const checkStockStatus = (product) => {
    if (!product || typeof product !== 'object') {
        throw new Error('Geçersiz ürün verisi');
    }

    if (!product.stock || typeof product.stock.quantity !== 'number') {
        return 'unknown';
    }

    if (product.stock.quantity <= 0) {
        return 'outOfStock';
    }

    if (product.stock.lowStockAlert && product.stock.quantity <= product.stock.lowStockAlert) {
        return 'lowStock';
    }

    return 'inStock';
};

// Spesifikasyon doğrulama - Detaylı kontroller eklendi
export const validateSpecifications = (productType, specs) => {
    if (!productType || !specs || typeof specs !== 'object') {
        throw new Error('Geçersiz ürün tipi veya spesifikasyon verisi');
    }

    // Ürün tipine göre zorunlu alanlar
    const requiredFields = {
        seed: ['germinationRate', 'growthPeriod'],
        seedling: ['variety', 'packaging.type'],
        fertilizer: ['applicationMethod', 'nutrientContent'],
        agriculturalTool: ['toolType', 'general.brand']
    };

    if (!requiredFields[productType]) {
        throw new Error('Geçersiz ürün tipi');
    }

    // Zorunlu alan kontrolü
    const missingFields = requiredFields[productType].filter(field => {
        const value = field.split('.').reduce((obj, key) => obj && obj[key], specs);
        return value === undefined || value === null || value === '';
    });

    if (missingFields.length > 0) {
        throw new Error(`Eksik zorunlu alanlar: ${missingFields.join(', ')}`);
    }

    return true;
};