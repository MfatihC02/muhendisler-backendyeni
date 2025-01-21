import Joi from 'joi';
import mongoose from 'mongoose';
import specifications from '../models/specifications.model.js';

// Temel ürün şeması
const baseProductSchema = Joi.object({
    name: Joi.string().min(3).max(200).required()
        .messages({
            'string.base': 'İsim bir metin olmalıdır',
            'string.empty': 'İsim boş olamaz',
            'string.min': 'İsim en az 3 karakter olmalıdır',
            'string.max': 'İsim en fazla 200 karakter olmalıdır',
            'any.required': 'İsim alanı zorunludur'
        }),
    category: Joi.string().custom((value, helpers) => {
        if (!mongoose.isValidObjectId(value)) {
            return helpers.message('Geçersiz kategori ID');
        }
        return value;
    }).required()
        .messages({
            'string.empty': 'Kategori boş olamaz',
            'any.required': 'Kategori alanı zorunludur'
        }),
    productType: Joi.string().valid('seed', 'seedling', 'fertilizer', 'agriculturalTool').required()
        .messages({
            'string.base': 'Ürün tipi bir metin olmalıdır',
            'any.only': 'Geçersiz ürün tipi',
            'any.required': 'Ürün tipi zorunludur'
        }),
    brand: Joi.string().required()
        .messages({
            'string.base': 'Marka bir metin olmalıdır',
            'string.empty': 'Marka boş olamaz',
            'any.required': 'Marka alanı zorunludur'
        }),
    price: Joi.object({
        current: Joi.number().min(0).required()
            .messages({
                'number.base': 'Fiyat bir sayı olmalıdır',
                'number.min': 'Fiyat 0\'dan küçük olamaz',
                'any.required': 'Fiyat zorunludur'
            }),
        discount: Joi.number().min(0).max(100).default(0)
            .messages({
                'number.base': 'İndirim oranı bir sayı olmalıdır',
                'number.min': 'İndirim oranı 0\'dan küçük olamaz',
                'number.max': 'İndirim oranı 100\'den büyük olamaz'
            }),
        discountEndDate: Joi.date().min('now').allow(null)
            .messages({
                'date.base': 'Geçersiz tarih formatı',
                'date.min': 'İndirim bitiş tarihi geçmiş bir tarih olamaz'
            })
    }),
    stock: Joi.object({
        quantity: Joi.number().min(0).allow(null)
            .messages({
                'number.base': 'Stok miktarı geçerli bir sayı olmalıdır',
                'number.min': 'Stok miktarı 0\'dan küçük olamaz'
            }),
        unit: Joi.string().valid('adet', 'kg', 'gram').allow(null)
            .messages({
                'string.base': 'Birim geçerli bir metin olmalıdır',
                'any.only': 'Geçersiz birim türü'
            }),
        lowStockAlert: Joi.number().min(0).allow(null)
            .messages({
                'number.base': 'Düşük stok uyarısı geçerli bir sayı olmalıdır',
                'number.min': 'Düşük stok uyarısı 0\'dan küçük olamaz'
            })
    }).optional().messages({
        'object.base': 'Stok bilgileri geçerli bir format içermelidir'
    }),
    status: Joi.string().valid('active', 'inactive', 'draft', 'outOfStock').default('draft')
        .messages({
            'string.base': 'Durum bir metin olmalıdır',
            'any.only': 'Geçersiz durum'
        })
});

// Ürün tiplerine göre özel spesifikasyon şemaları
const specificationSchemas = {
    seed: Joi.object({
        germinationRate: Joi.number().min(0).max(100).required(),
        growthPeriod: Joi.string().required(),
        harvestTime: Joi.string(),
        plantingDepth: Joi.string(),
        sowingDistance: Joi.string(),
        yield: Joi.string(),
        season: Joi.string().valid('ilkbahar', 'yaz', 'sonbahar', 'kış', 'tümYıl'),
        origin: Joi.string(),
        packaging: Joi.object({
            weight: Joi.number().required(),
            unit: Joi.string().valid('gr', 'kg').required()
        }).required()
    }),

    seedling: Joi.object({
        planting: Joi.object({
            soil: Joi.string(),
            season: Joi.string(),
            spacing: Joi.string()
        }),
        variety: Joi.string().valid('hibrit', 'standart').required(),
        packaging: Joi.object({
            type: Joi.string().valid('200lu_viyol', '350li_viyol', '400lu_viyol', 'diger').required(),
            description: Joi.string()
        }).required()
    }),

    fertilizer: Joi.object({
        nutrientContent: Joi.object().pattern(
            Joi.string(),
            Joi.object({
                value: Joi.number(),
                unit: Joi.string().default('%')
            })
        ),
        applicationMethod: Joi.string().required(),
        composition: Joi.string(),
        packaging: Joi.object({
            weight: Joi.number(),
            unit: Joi.string().valid('gr', 'kg', 'lt')
        }),
        usage: Joi.object({
            dosage: Joi.string(),
            frequency: Joi.string(),
            warnings: Joi.array().items(Joi.string())
        })
    }),

    agriculturalTool: Joi.object({
        toolType: Joi.string().valid('manual', 'motorized', 'electronic', 'mechanical').required(),
        general: Joi.object({
            brand: Joi.string().required(),
            model: Joi.string(),
            manufacturingYear: Joi.number(),
            warranty: Joi.object({
                duration: Joi.number(),
                type: Joi.string()
            }),
            origin: Joi.string(),
            weight: Joi.object({
                value: Joi.number(),
                unit: Joi.string().valid('kg', 'gr')
            }),
            dimensions: Joi.object({
                length: Joi.number(),
                width: Joi.number(),
                height: Joi.number(),
                unit: Joi.string().valid('cm', 'm')
            })
        }).required(),
        technical: Joi.object({
            engine: Joi.object({
                type: Joi.string().valid('electric', 'gasoline', 'diesel', null),
                power: Joi.object({
                    value: Joi.number(),
                    unit: Joi.string()
                }),
                fuelType: Joi.string(),
                fuelCapacity: Joi.number()
            }),
            sprayer: Joi.object({
                tankCapacity: Joi.object({
                    value: Joi.number(),
                    unit: Joi.string()
                }),
                sprayDistance: Joi.object({
                    value: Joi.number(),
                    unit: Joi.string()
                }),
                pressureRange: Joi.object({
                    min: Joi.number(),
                    max: Joi.number(),
                    unit: Joi.string()
                }),
                nozzleTypes: Joi.array().items(Joi.string())
            }),
            hoeMachine: Joi.object({
                workingWidth: Joi.object({
                    value: Joi.number(),
                    unit: Joi.string()
                }),
                workingDepth: Joi.object({
                    value: Joi.number(),
                    unit: Joi.string()
                }),
                bladeCount: Joi.number(),
                gearSystem: Joi.string()
            })
        }),
        maintenance: Joi.object({
            spareParts: Joi.array().items(
                Joi.object({
                    name: Joi.string(),
                    code: Joi.string(),
                    availability: Joi.boolean()
                })
            ),
            serviceInfo: Joi.object({
                available: Joi.boolean(),
                coverage: Joi.array().items(Joi.string()),
                instructions: Joi.string()
            })
        }),
        usage: Joi.object({
            applications: Joi.array().items(Joi.string()),
            safety: Joi.array().items(Joi.string()),
            instructions: Joi.string()
        })
    })
};

// Validation middleware'leri
export const validateCreateProduct = (req, res, next) => {
    const { error } = baseProductSchema.validate(req.body, { abortEarly: false });

    if (error) {
        const errors = error.details.map(detail => ({
            field: detail.path.join('.'),
            message: detail.message
        }));

        return res.status(400).json({
            success: false,
            message: 'Validasyon hatası',
            errors
        });
    }

    // Ürün tipine özgü spesifikasyon validasyonu
    if (req.body.specifications) {
        const specSchema = specificationSchemas[req.body.productType];
        const { error: specError } = specSchema.validate(req.body.specifications, { abortEarly: false });

        if (specError) {
            const errors = specError.details.map(detail => ({
                field: `specifications.${detail.path.join('.')}`,
                message: detail.message
            }));

            return res.status(400).json({
                success: false,
                message: 'Spesifikasyon validasyon hatası',
                errors
            });
        }
    }

    next();
};

export const validateUpdateProduct = (req, res, next) => {
    // Update için required alanları opsiyonel yap
    const updateSchema = baseProductSchema.fork(
        ['name', 'category', 'productType', 'brand', 'price.current', 'stock.quantity', 'stock.unit'],
        (schema) => schema.optional()
    );

    const { error } = updateSchema.validate(req.body, { abortEarly: false });

    if (error) {
        const errors = error.details.map(detail => ({
            field: detail.path.join('.'),
            message: detail.message
        }));

        return res.status(400).json({
            success: false,
            message: 'Validasyon hatası',
            errors
        });
    }

    // Ürün tipine özgü spesifikasyon validasyonu
    if (req.body.specifications && req.body.productType) {
        const specSchema = specificationSchemas[req.body.productType];
        const { error: specError } = specSchema.validate(req.body.specifications, { abortEarly: false });

        if (specError) {
            const errors = specError.details.map(detail => ({
                field: `specifications.${detail.path.join('.')}`,
                message: detail.message
            }));

            return res.status(400).json({
                success: false,
                message: 'Spesifikasyon validasyon hatası',
                errors
            });
        }
    }

    next();
};

// Query parametreleri validasyonu
export const validateQueryParams = (req, res, next) => {
    const querySchema = Joi.object({
        page: Joi.number().min(1),
        limit: Joi.number().min(1).max(100),
        sort: Joi.string(),
        category: Joi.string().custom((value, helpers) => {
            if (!mongoose.isValidObjectId(value)) {
                return helpers.message('Geçersiz kategori ID');
            }
            return value;
        }),
        productType: Joi.string().valid('seed', 'seedling', 'fertilizer', 'agriculturalTool'),
        brand: Joi.string(),
        minPrice: Joi.number().min(0),
        maxPrice: Joi.number().min(0),
        status: Joi.string().valid('active', 'inactive', 'draft', 'outOfStock'),
        search: Joi.string().min(2)
    });

    const { error } = querySchema.validate(req.query, { abortEarly: false });

    if (error) {
        const errors = error.details.map(detail => ({
            field: detail.path.join('.'),
            message: detail.message
        }));

        return res.status(400).json({
            success: false,
            message: 'Query parametre hatası',
            errors
        });
    }

    next();
};