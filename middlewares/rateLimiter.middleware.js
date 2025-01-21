import rateLimit from 'express-rate-limit';
import winston from 'winston';

// Winston logger konfigürasyonu
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
            return `[${timestamp}] [RATE-LIMIT] ${level}: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
        })
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'rate-limit.log' })
    ]
});

// Rate limiter oluşturucu
const createRateLimiter = (options) => {
    const {
        windowMs,
        max,
        message,
        skipFailedRequests = false,
        skipSuccessfulRequests = false,
        keyPrefix = ''
    } = options;

    return rateLimit({
        windowMs,
        max,
        message: {
            success: false,
            message
        },
        standardHeaders: true,
        legacyHeaders: false,
        skipFailedRequests,
        skipSuccessfulRequests,
        keyGenerator: (req) => {
            // Kullanıcı bazlı rate limiting (eğer kullanıcı girişi yapılmışsa)
            const userId = req.user ? req.user.id : '';
            return `${keyPrefix}:${userId || req.ip}:${req.headers['user-agent']}`;
        },
        handler: (req, res, next, options) => {
            const userId = req.user ? req.user.id : 'anonymous';
            logger.warn('Rate limit aşıldı', {
                userId,
                ip: req.ip,
                endpoint: req.originalUrl,
                userAgent: req.headers['user-agent']
            });
            res.status(429).json(options.message);
        }
    });
};

// Genel API limiter
export const apiLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 dakika
    max: 120,
    message: 'Çok fazla istek yapıldı, lütfen daha sonra tekrar deneyin.',
    keyPrefix: 'api'
});

// Auth işlemleri için özel limiter
export const authLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 dakika
    max: 5,
    message: 'Çok fazla giriş denemesi yapıldı, lütfen daha sonra tekrar deneyin.',
    skipSuccessfulRequests: true, // Başarılı girişleri sayma
    keyPrefix: 'auth'
});

// Ürün işlemleri için özel limiter
export const productLimiter = createRateLimiter({
    windowMs: 60 * 60 * 1000, // 1 saat
    max: 1000,
    message: 'Çok fazla ürün isteği yapıldı, lütfen daha sonra tekrar deneyin.',
    keyPrefix: 'product'
});

// Upload işlemleri için özel limiter
export const uploadLimiter = createRateLimiter({
    windowMs: 60 * 60 * 1000, // 1 saat
    max: 50,
    message: 'Çok fazla yükleme isteği yapıldı, lütfen daha sonra tekrar deneyin.',
    keyPrefix: 'upload'
});

// Kullanıcı işlemleri için özel limiter
export const userLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 dakika
    max: 50,
    message: 'Çok fazla kullanıcı isteği yapıldı, lütfen daha sonra tekrar deneyin.',
    keyPrefix: 'user'
});

// Sipariş işlemleri için özel limiter
export const orderLimiter = createRateLimiter({
    windowMs: 60 * 60 * 1000, // 1 saat
    max: 100,
    message: 'Çok fazla sipariş isteği yapıldı, lütfen daha sonra tekrar deneyin.',
    skipFailedRequests: true, // Başarısız istekleri sayma
    keyPrefix: 'order'
});

// Stok işlemleri için özel limiter
export const stockLimiter = createRateLimiter({
    windowMs: 60 * 60 * 1000, // 1 saat
    max: 200,
    message: 'Çok fazla stok isteği yapıldı, lütfen daha sonra tekrar deneyin.',
    keyPrefix: 'stock'
});

// Ödeme başlatma işlemleri için özel limiter
export const paymentInitiateLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 dakika
    max: parseInt(process.env.MAX_PAYMENT_ATTEMPTS) || 3,
    message: 'Çok fazla ödeme denemesi yapıldı, lütfen daha sonra tekrar deneyin.',
    skipSuccessfulRequests: true, // Başarılı ödemeleri sayma
    keyPrefix: 'payment_initiate'
});

// 3D Secure callback işlemleri için özel limiter
export const payment3DCallbackLimiter = createRateLimiter({
    windowMs: 5 * 60 * 1000, // 5 dakika
    max: 5,
    message: 'Çok fazla 3D Secure callback denemesi yapıldı.',
    skipSuccessfulRequests: true,
    keyPrefix: 'payment_3d_callback'
});

// Ödeme sorgulama işlemleri için özel limiter
export const paymentStatusLimiter = createRateLimiter({
    windowMs: 60 * 60 * 1000, // 1 saat
    max: 100,
    message: 'Çok fazla ödeme sorgulama isteği yapıldı, lütfen daha sonra tekrar deneyin.',
    keyPrefix: 'payment_status'
});

// İade işlemleri için özel limiter
export const paymentRefundLimiter = createRateLimiter({
    windowMs: 60 * 60 * 1000, // 1 saat
    max: 20,
    message: 'Çok fazla iade işlemi denemesi yapıldı, lütfen daha sonra tekrar deneyin.',
    skipSuccessfulRequests: true,
    keyPrefix: 'payment_refund'
});
