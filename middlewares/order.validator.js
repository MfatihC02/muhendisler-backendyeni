// middlewares/order.validator.js
import Joi from 'joi';
import { Cart } from '../models/cart.model.js';
import { Address } from '../models/address.model.js';
import { Stock } from '../models/stock.model.js';
import StockReservation from '../models/stockReservation.model.js';
import winston from 'winston';

// Winston logger konfigürasyonu
const logger = winston.createLogger({
    level: 'debug',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'logs/order-validator.log' })
    ]
});

const orderItemSchema = Joi.object({
    productId: Joi.string().hex().length(24).required(),
    quantity: Joi.number().min(1).required(),
    unit: Joi.string().valid('adet', 'kg', 'gram', 'lt').required(),
    reservationId: Joi.string().hex().length(24).required()
});

const createOrderSchema = Joi.object({
    items: Joi.array().items(orderItemSchema).min(1).required(),
    shippingAddressId: Joi.string().hex().length(24).required(),
    totalAmount: Joi.number().min(0).required(),
    note: Joi.string().max(500).optional()
});

const updateOrderSchema = Joi.object({
    status: Joi.string().valid(
        'PROCESSING',
        'SHIPPED',
        'DELIVERED',
        'CANCELLED',
        'REFUNDED'
    ),
    shippingDetails: Joi.object({
        carrier: Joi.string(),
        trackingNumber: Joi.string(),
        estimatedDeliveryDate: Joi.date().greater('now')
    }),
    note: Joi.string().max(500)
});

export const validateCreateOrder = async (req, res, next) => {
    try {
        logger.debug('Sipariş validasyonu başlıyor', {
            body: req.body,
            user: req.user ? req.user._id : 'Kullanıcı bulunamadı'
        });

        const { error } = createOrderSchema.validate(req.body, { abortEarly: false });
        if (error) {
            logger.error('Şema validasyonu hatası', {
                error: error.details
            });
            return res.status(400).json({
                error: error.details.map(detail => ({
                    message: detail.message,
                    path: detail.path
                }))
            });
        }

        logger.debug('Şema validasyonu başarılı, adres kontrolü yapılıyor');

        // Adres kontrolü
        const address = await Address.findOne({
            _id: req.body.shippingAddressId,
            user: req.user._id
        });

        logger.debug('Adres sorgusu sonucu', {
            addressId: req.body.shippingAddressId,
            userId: req.user._id,
            found: !!address
        });

        if (!address) {
            logger.error('Geçersiz teslimat adresi', {
                addressId: req.body.shippingAddressId,
                userId: req.user._id
            });
            return res.status(400).json({ error: 'Geçersiz teslimat adresi' });
        }

        logger.debug('Adres kontrolü başarılı, stok kontrolleri başlıyor');

        // Her ürün için stok ve rezervasyon kontrolü
        for (const item of req.body.items) {
            logger.debug('Stok kontrolü yapılıyor', { item });

            // Stok kontrolü
            const stock = await Stock.findOne({ product: item.productId });

            logger.debug('Stok sorgusu sonucu', {
                productId: item.productId,
                found: !!stock
            });

            if (!stock) {
                logger.error('Ürün stokta bulunamadı', {
                    productId: item.productId
                });
                return res.status(400).json({
                    error: `Ürün stokta bulunamadı: ${item.productId}`
                });
            }

            // Rezervasyon kontrolü
            const reservation = await StockReservation.findOne({
                _id: item.reservationId,
                product: item.productId,
                user: req.user._id,
                status: { $in: ['CART', 'CHECKOUT'] },
                expiresAt: { $gt: new Date() }
            });

            logger.debug('Rezervasyon kontrolü', {
                reservationId: item.reservationId,
                found: !!reservation,
                status: reservation?.status
            });

            if (!reservation) {
                logger.error('Geçersiz rezervasyon', {
                    reservationId: item.reservationId
                });
                return res.status(400).json({
                    error: `Geçersiz rezervasyon: ${item.reservationId}`
                });
            }

            // Miktar kontrolü
            if (reservation.quantity !== item.quantity) {
                logger.error('Rezervasyon miktarı uyuşmuyor', {
                    reservationId: item.reservationId,
                    reservedQuantity: reservation.quantity,
                    requestedQuantity: item.quantity
                });
                return res.status(400).json({
                    error: `Rezervasyon miktarı uyuşmuyor: ${item.reservationId}`
                });
            }

            // Rezervasyon durumu kontrolü
            if (!['CART', 'CHECKOUT'].includes(reservation.status)) {
                logger.error('Geçersiz rezervasyon durumu', {
                    reservationId: item.reservationId,
                    status: reservation.status
                });
                return res.status(400).json({
                    error: `Geçersiz rezervasyon durumu: ${reservation.status}`
                });
            }
        }

        logger.info('Tüm validasyonlar başarılı');
        next();
    } catch (error) {
        logger.error('Validasyon sırasında beklenmeyen hata', {
            error: error.message,
            stack: error.stack
        });
        return res.status(500).json({ error: 'Validasyon sırasında bir hata oluştu' });
    }
};

export const validateUpdateOrder = (req, res, next) => {
    const { error } = updateOrderSchema.validate(req.body);
    if (error) {
        return res.status(400).json({
            error: error.details.map(detail => ({
                message: detail.message,
                path: detail.path
            }))
        });
    }
    next();
};
