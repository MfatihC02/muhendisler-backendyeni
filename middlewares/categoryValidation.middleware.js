import { body, param, query } from 'express-validator';
import { Category } from '../models/category.model.js';
import { validationResult } from 'express-validator';
import mongoose from 'mongoose';

export const categoryValidation = {
    createValidation: [
        body('name')
            .trim()
            .notEmpty()
            .withMessage('Kategori adı zorunludur')
            .isLength({ min: 2, max: 100 })
            .withMessage('Kategori adı 2-100 karakter arasında olmalıdır'),

        body('parent')
            .optional()
            .custom(async (value) => {
                if (!value || value === 'null') return true;

                try {
                    // Parent ID'yi ObjectId'ye çevir
                    const parentId = new mongoose.Types.ObjectId(value.toString());
                    
                    // Parent kategorinin varlığını kontrol et
                    const parentExists = await Category.findById(parentId);
                    if (!parentExists) {
                        throw new Error('Belirtilen üst kategori bulunamadı');
                    }
                    return true;
                } catch (error) {
                    if (error.name === 'BSONError' || error.name === 'CastError') {
                        throw new Error('Geçersiz parent ID formatı');
                    }
                    throw error;
                }
            }),

        body('description')
            .optional()
            .isLength({ max: 500 })
            .withMessage('Açıklama en fazla 500 karakter olmalıdır'),

        body('order')
            .optional()
            .isInt({ min: 0 })
            .withMessage('Sıralama değeri pozitif bir sayı olmalıdır'),

        body('isActive')
            .optional()
            .isBoolean()
            .withMessage('Geçersiz aktiflik durumu'),

        body('metadata')
            .optional()
            .isObject()
            .withMessage('Metadata bir nesne olmalıdır'),

        body('metadata.title')
            .optional()
            .isLength({ max: 200 })
            .withMessage('Meta başlık en fazla 200 karakter olmalıdır'),

        body('metadata.description')
            .optional()
            .isLength({ max: 500 })
            .withMessage('Meta açıklama en fazla 500 karakter olmalıdır'),

        body('metadata.keywords')
            .optional()
            .isArray()
            .withMessage('Meta anahtar kelimeler bir dizi olmalıdır')
    ],

    updateValidation: [
        param('id')
            .custom((value) => {
                if (!mongoose.Types.ObjectId.isValid(value)) {
                    throw new Error('Geçersiz kategori ID formatı');
                }
                return true;
            }),

        body('name')
            .optional()
            .trim()
            .isLength({ min: 2, max: 100 })
            .withMessage('Kategori adı 2-100 karakter arasında olmalıdır'),

        body('parent')
            .optional()
            .custom(async (value, { req }) => {
                if (!value || value === 'null') return true;

                try {
                    // Parent ID'yi ObjectId'ye çevir
                    const parentId = new mongoose.Types.ObjectId(value.toString());
                    
                    // Parent kategorinin varlığını kontrol et
                    const parentExists = await Category.findById(parentId);
                    if (!parentExists) {
                        throw new Error('Belirtilen üst kategori bulunamadı');
                    }

                    // Kendisini parent olarak seçemez
                    if (parentId.toString() === req.params.id) {
                        throw new Error('Bir kategori kendisini üst kategori olarak seçemez');
                    }

                    // Döngüsel parent kontrolü
                    const childCategories = await Category.find({
                        'ancestors._id': mongoose.Types.ObjectId(req.params.id)
                    });
                    if (childCategories.some(cat => cat._id.toString() === parentId.toString())) {
                        throw new Error('Döngüsel kategori ilişkisi oluşturulamaz');
                    }

                    return true;
                } catch (error) {
                    if (error.name === 'BSONError' || error.name === 'CastError') {
                        throw new Error('Geçersiz parent ID formatı');
                    }
                    throw error;
                }
            })
    ],

    listValidation: [
        query('page')
            .optional()
            .isInt({ min: 1 })
            .withMessage('Sayfa numarası geçerli bir sayı olmalıdır'),

        query('limit')
            .optional()
            .isInt({ min: 1, max: 100 })
            .withMessage('Limit 1-100 arasında olmalıdır'),

        query('sort')
            .optional()
            .isIn(['name', 'order', 'createdAt', '-name', '-order', '-createdAt'])
            .withMessage('Geçersiz sıralama parametresi'),

        query('parent')
            .optional()
            .custom((value) => {
                if (value === 'null') return true;
                if (!mongoose.Types.ObjectId.isValid(value)) {
                    throw new Error('Geçersiz parent ID formatı');
                }
                return true;
            })
    ],

    idValidation: [
        param('id')
            .custom((value) => {
                if (!mongoose.Types.ObjectId.isValid(value)) {
                    throw new Error('Geçersiz kategori ID formatı');
                }
                return true;
            })
    ],

    statusValidation: [
        param('id')
            .custom((value) => {
                if (!mongoose.Types.ObjectId.isValid(value)) {
                    throw new Error('Geçersiz kategori ID formatı');
                }
                return true;
            }),

        body('isActive')
            .notEmpty()
            .withMessage('isActive alanı zorunludur')
            .isBoolean()
            .withMessage('isActive alanı boolean olmalıdır')
    ]
};

// Validasyon sonuçlarını kontrol eden middleware
export const validateResult = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            errors: errors.array()
        });
    }
    next();
};