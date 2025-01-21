// middlewares/stock.validator.js
import Joi from 'joi';
import mongoose from 'mongoose';

// Temel stok validasyon şeması
const baseStockSchema = {
    productId: Joi.string().hex().length(24).required(),
    quantity: Joi.number().min(0).required(),
    lowStockThreshold: Joi.number().min(0).required(),
    location: Joi.object({
        warehouse: Joi.string().required(),
        section: Joi.string().required(),
        shelf: Joi.string().required()
    })
};

// Ürün tipine göre özel validasyon şemaları
const stockValidationSchemas = {
    seed: {
        ...baseStockSchema,
        unit: Joi.string().valid('gram', 'kg', 'lt', 'adet', 'adet').required(),
        storageConditions: Joi.object({
            temperature: Joi.object({
                min: Joi.number().required(),
                max: Joi.number().required(),
                unit: Joi.string().valid('C', 'F').default('C')
            }),
            humidity: Joi.object({
                min: Joi.number().min(0).max(100).required(),
                max: Joi.number().min(0).max(100).required(),
                unit: Joi.string().valid('%').default('%')
            })
        })
    },
    seedling: {
        ...baseStockSchema,
        unit: Joi.string().valid('adet').required(),
        storageConditions: Joi.object({
            temperature: Joi.object({
                min: Joi.number().required(),
                max: Joi.number().required(),
                unit: Joi.string().valid('C', 'F').default('C')
            })
        })
    },
    fertilizer: {
        ...baseStockSchema,
        unit: Joi.string().valid('kg', 'lt').required(),
        storageConditions: Joi.object({
            temperature: Joi.object({
                min: Joi.number().required(),
                max: Joi.number().required()
            }),
            humidity: Joi.object({
                min: Joi.number().required(),
                max: Joi.number().required()
            })
        })
    },
    agriculturalTool: {
        ...baseStockSchema,
        unit: Joi.string().valid('adet').required()
    }
};

// Rezervasyon validasyon şeması
const reservationSchema = Joi.object({
    quantity: Joi.number().min(1).required(),
    expiresIn: Joi.number().min(1).max(86400).default(1800) // 1 saniye ile 24 saat arası, varsayılan 30 dakika
});

// Rezervasyon validasyonu
export const validateReservation = async (req, res, next) => {
    try {
        const { error, value } = reservationSchema.validate(req.body);
        
        if (error) {
            return res.status(400).json({
                success: false,
                message: 'Validasyon hatası',
                error: error.details[0].message
            });
        }

        req.validatedReservation = value;
        next();
    } catch (error) {
        console.error('Rezervasyon validasyon hatası:', error);
        res.status(500).json({
            success: false,
            message: 'Validasyon işlemi sırasında bir hata oluştu',
            error: error.message
        });
    }
};

export const validateStock = async (req, res, next) => {
    try {
        console.log('Validasyon başlıyor. Gelen veri:', req.body);

        // Ürünün tipini kontrol et
        const Product = mongoose.model('Product');
        const product = await Product.findById(req.body.productId);

        if (!product) {
            console.error('Ürün bulunamadı:', req.body.productId);
            return res.status(404).json({
                success: false,
                message: 'Ürün bulunamadı',
                productId: req.body.productId
            });
        }

        console.log('Ürün tipi:', product.productType);

        // Ürün tipine göre şema seç
        const schema = stockValidationSchemas[product.productType];
        if (!schema) {
            console.error('Geçersiz ürün tipi:', product.productType);
            return res.status(400).json({
                success: false,
                message: 'Geçersiz ürün tipi',
                productType: product.productType,
                validTypes: Object.keys(stockValidationSchemas)
            });
        }

        const validationSchema = Joi.object(schema);
        const { error, value } = validationSchema.validate(req.body, { abortEarly: false });

        if (error) {
            console.error('Validasyon hatası:', error.details);
            return res.status(400).json({
                success: false,
                message: 'Validasyon hatası',
                errors: error.details.map(detail => ({
                    field: detail.path.join('.'),
                    message: detail.message,
                    type: detail.type
                }))
            });
        }

        req.validatedStock = value;
        console.log('Validasyon başarılı. Doğrulanmış veri:', value);
        next();
    } catch (error) {
        console.error('Validasyon işlemi sırasında hata:', error);
        res.status(500).json({
            success: false,
            message: 'Validasyon işlemi sırasında bir hata oluştu',
            error: error.message
        });
    }
};

// Rezervasyon miktarı validasyonu
export const validateReservationQuantity = async (req, res, next) => {
    try {
        const Stock = mongoose.model('Stock');
        const stock = await Stock.findById(req.params.id);

        if (!stock) {
            return res.status(404).json({
                success: false,
                message: 'Stok bulunamadı'
            });
        }

        // Mevcut rezervasyonları kontrol et
        const reservedQuantity = stock.reservations
            .filter(r => r.status === 'TEMPORARY' || r.status === 'CONFIRMED')
            .reduce((total, r) => total + r.quantity, 0);

        // İstenen miktar için yeterli stok var mı?
        const availableQuantity = stock.quantity - reservedQuantity;
        
        if (availableQuantity < req.body.quantity) {
            return res.status(400).json({
                success: false,
                message: 'Yetersiz stok',
                available: availableQuantity,
                requested: req.body.quantity
            });
        }

        // Stok bilgisini request nesnesine ekle
        req.stock = stock;
        next();
    } catch (error) {
        console.error('Rezervasyon miktarı validasyon hatası:', error);
        res.status(500).json({
            success: false,
            message: 'Rezervasyon miktarı kontrolü sırasında bir hata oluştu',
            error: error.message
        });
    }
};

// Stok güncelleme validasyon şeması
const stockUpdateSchema = Joi.object({
    quantity: Joi.number().min(0).required(),
    type: Joi.string().valid('add', 'remove').required(),
    reason: Joi.string().valid('purchase', 'return', 'correction', 'sale', 'damage', 'expired').required(),
    note: Joi.string().optional()
});

// Stok güncelleme validasyonu
export const validateStockUpdate = async (req, res, next) => {
    try {
        console.log('Stok güncelleme validasyonu başlıyor. Gelen veri:', req.body);

        const { error, value } = stockUpdateSchema.validate(req.body, { abortEarly: false });

        if (error) {
            console.error('Validasyon hatası:', error.details);
            return res.status(400).json({
                success: false,
                message: 'Validasyon hatası',
                errors: error.details.map(detail => ({
                    field: detail.path.join('.'),
                    message: detail.message,
                    type: detail.type
                }))
            });
        }

        console.log('Validasyon başarılı. Doğrulanmış veri:', value);
        req.validatedStockUpdate = value;
        next();
    } catch (error) {
        console.error('Validasyon hatası:', error);
        res.status(500).json({
            success: false,
            message: 'Validasyon işlemi sırasında bir hata oluştu',
            error: error.message
        });
    }
};

// Stok güncelleme validasyonu
export const validateStockUpdate2 = async (req, res, next) => {
    try {
        const allowedUpdates = ['quantity', 'lowStockThreshold', 'location', 'storageConditions'];
        const updates = Object.keys(req.body);

        const isValidOperation = updates.every(update => allowedUpdates.includes(update));
        if (!isValidOperation) {
            return res.status(400).json({ error: 'Geçersiz güncelleme alanları' });
        }

        const stock = await req.db.Stock.findById(req.params.id).populate('product');
        if (!stock) {
            return res.status(404).json({ error: 'Stok bulunamadı' });
        }

        const schema = stockValidationSchemas[stock.product.productType];
        const updateSchema = {};
        updates.forEach(update => {
            updateSchema[update] = schema[update];
        });

        const { error } = Joi.object(updateSchema).validate(req.body, { abortEarly: false });
        if (error) {
            return res.status(400).json({
                error: error.details.map(detail => ({
                    message: detail.message,
                    path: detail.path
                }))
            });
        }

        req.stock = stock;
        next();
    } catch (error) {
        next(error);
    }
};