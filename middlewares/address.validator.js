import Joi from 'joi';
import { VALID_CITIES, VALID_STATE_CODES } from '../models/address.model.js';

// Konya ve Ankara için geçerli ilçeler
const VALID_DISTRICTS = {
    'Konya': [
        'Selçuklu',
        'Meram',
        'Karatay'
    ],
    'Ankara': [
        'Çankaya',
        'Keçiören',
        'Yenimahalle'
    ]
};

export const validateAddress = (req, res, next) => {
    const schema = Joi.object({
        title: Joi.string()
            .required()
            .min(3)
            .max(50)
            .messages({
                'string.empty': 'Adres başlığı boş olamaz',
                'string.min': 'Adres başlığı en az 3 karakter olmalıdır',
                'string.max': 'Adres başlığı en fazla 50 karakter olmalıdır',
                'any.required': 'Adres başlığı zorunludur'
            }),

        fullName: Joi.string()
            .required()
            .min(3)
            .max(100)
            .pattern(/^[a-zA-ZğüşıöçĞÜŞİÖÇ\s]+$/)
            .messages({
                'string.empty': 'Ad soyad boş olamaz',
                'string.min': 'Ad soyad en az 3 karakter olmalıdır',
                'string.max': 'Ad soyad en fazla 100 karakter olmalıdır',
                'string.pattern.base': 'Ad soyad sadece harf içerebilir',
                'any.required': 'Ad soyad zorunludur'
            }),

        phone: Joi.string()
            .required()
            .pattern(/^[0-9]{10}$/)
            .messages({
                'string.empty': 'Telefon numarası boş olamaz',
                'string.pattern.base': 'Telefon numarası 10 haneli olmalıdır (Örn: 5321234567)',
                'any.required': 'Telefon numarası zorunludur'
            }),

        city: Joi.string()
            .required()
            .valid(...VALID_CITIES)
            .messages({
                'string.empty': 'Şehir boş olamaz',
                'any.only': 'Geçerli bir şehir seçiniz (Konya veya Ankara)',
                'any.required': 'Şehir zorunludur'
            }),

        district: Joi.string()
            .required()
            .custom((value, helpers) => {
                const city = helpers.state.ancestors[0].city;
                if (!VALID_DISTRICTS[city]?.includes(value)) {
                    return helpers.error('any.invalid');
                }
                return value;
            })
            .messages({
                'string.empty': 'İlçe boş olamaz',
                'any.invalid': 'Seçilen şehir için geçerli bir ilçe giriniz',
                'any.required': 'İlçe zorunludur'
            }),

        neighborhood: Joi.string()
            .required()
            .min(2)
            .max(100)
            .messages({
                'string.empty': 'Mahalle boş olamaz',
                'string.min': 'Mahalle adı en az 2 karakter olmalıdır',
                'string.max': 'Mahalle adı en fazla 100 karakter olmalıdır',
                'any.required': 'Mahalle zorunludur'
            }),

        fullAddress: Joi.string()
            .required()
            .min(10)
            .max(250)
            .messages({
                'string.empty': 'Açık adres boş olamaz',
                'string.min': 'Açık adres en az 10 karakter olmalıdır',
                'string.max': 'Açık adres en fazla 250 karakter olmalıdır',
                'any.required': 'Açık adres zorunludur'
            }),

        zipCode: Joi.string()
            .required()
            .pattern(/^[0-9]{5}$/)
            .messages({
                'string.empty': 'Posta kodu boş olamaz',
                'string.pattern.base': 'Posta kodu 5 haneli olmalıdır',
                'any.required': 'Posta kodu zorunludur'
            }),

        stateCode: Joi.string()
            .valid(...VALID_STATE_CODES)
            .messages({
                'any.only': 'Geçerli bir il kodu giriniz (TR-42 veya TR-06)',
            }),

        countryCode: Joi.string()
            .valid('TR')
            .default('TR')
            .messages({
                'any.only': 'Şu an sadece Türkiye (TR) desteklenmektedir'
            }),

        isDefault: Joi.boolean()
            .default(false),

        type: Joi.string()
            .valid('shipping', 'billing', 'both')
            .default('both')
            .messages({
                'any.only': 'Geçerli bir adres tipi seçiniz (shipping, billing veya both)'
            })
    });

    const { error } = schema.validate(req.body, { 
        abortEarly: false,
        stripUnknown: true
    });

    if (error) {
        const errors = error.details.map(err => ({
            field: err.path[0],
            message: err.message
        }));
        
        return res.status(400).json({ 
            success: false,
            errors: errors
        });
    }

    next();
};

export const validateAddressId = (req, res, next) => {
    const schema = Joi.object({
        id: Joi.string()
            .pattern(/^[0-9a-fA-F]{24}$/)
            .required()
            .messages({
                'string.pattern.base': 'Geçersiz adres ID formatı',
                'any.required': 'Adres ID zorunludur'
            })
    });

    const { error } = schema.validate({ id: req.params.id });
    if (error) {
        return res.status(400).json({ 
            success: false,
            error: error.details[0].message 
        });
    }
    
    next();
};
