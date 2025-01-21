import mongoose from 'mongoose';
import { body, param, validationResult } from 'express-validator';

// Rezervasyon validasyon middleware'i
const validateReservation = [
    // ID kontrolü
    param('id')
        .notEmpty()
        .withMessage('Ürün ID\'si gerekli')
        .custom((value) => mongoose.Types.ObjectId.isValid(value))
        .withMessage('Geçersiz ürün ID\'si'),

    // Miktar kontrolü
    body('quantity')
        .isInt({ min: 1 })
        .withMessage('Miktar 1 veya daha büyük bir sayı olmalıdır'),

    // Validasyon sonuçlarını kontrol et
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Validasyon hatası',
                errors: errors.array()
            });
        }
        next();
    }
];

export default validateReservation;
