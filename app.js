import express from 'express';
import mongoose from 'mongoose';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { createServer } from 'http';
import 'dotenv/config';
import winston from 'winston';
import { initSocket } from './socket/index.js';
import performanceMetrics from './middlewares/performanceMetrics.middleware.js';
import { monitorMiddleware } from './middleware/performance/cache.js';
import { initializeIndexes } from './config/database/indexes/index.init.js';
import cron from 'node-cron';

// Model tanımlamalarını import et
import './models/product.model.js';
import './models/category.model.js';
import './models/user.model.js';
import './models/cart.model.js';
import './models/order.model.js';
import './models/stock.model.js';
import './models/stockReservation.model.js';

import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.routes.js';
import categoryRoutes from './routes/category.routes.js';
import productRoutes from './routes/product.routes.js';
import cartRoutes from './routes/cart.routes.js';
import addressRoutes from './routes/address.routes.js';
import orderRoutes from './routes/order.routes.js';
import stockRoutes from './routes/stock.routes.js';
import paymentRoutes from './routes/payment.routes.js';
import reviewRoutes from './routes/review.routes.js';
import contactRoutes from './routes/contact.routes.js';

import {
    apiLimiter,
    authLimiter,
    productLimiter,
    uploadLimiter,
    userLimiter,
    orderLimiter,
    stockLimiter
} from './middlewares/rateLimiter.middleware.js';

const app = express();
const httpServer = createServer(app);

// Winston konfigürasyonu
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
            return `[${timestamp}] [APP] ${level}: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
        })
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'app.log' })
    ]
});

// Socket.IO'yu başlat
initSocket(httpServer);

// Debug middleware
app.use((req, res, next) => {
    logger.info('Gelen İstek:', {
        method: req.method,
        path: req.path,
        origin: req.headers.origin,
        headers: req.headers
    });
    next();
});

// CORS yapılandırması
const allowedDomains = [
    'https://muhendisler-frontend.vercel.app',
    'https://xn--tarmmarket-zub.com.tr',
    'https://tarımmarket.com.tr'
];

const corsOptions = {
    origin: function(origin, callback) {
        try {
            // Development ortamında veya test araçlarından gelen istekler için
            if (!origin) {
                return callback(null, true);
            }

            // Origin'i normalize et
            const normalizedOrigin = origin.toLowerCase().trim();
            
            if (allowedDomains.includes(normalizedOrigin)) {
                callback(null, true);
            } else {
                logger.warn('Reddedilen origin:', normalizedOrigin);
                callback(new Error('CORS policy violation'));
            }
        } catch (error) {
            logger.error('CORS kontrol hatası:', error);
            callback(null, false);
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cookie', 'cache-control'],
    exposedHeaders: ['set-cookie']
};

// CORS middleware'ini ilk sıraya al
app.use(cors(corsOptions));

// Temel middleware'ler
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Performance middleware
app.use(monitorMiddleware);

// Request logging middleware
app.use((req, res, next) => {
    logger.info(`${req.method} ${req.url}`, {
        ip: req.ip,
        userAgent: req.get('user-agent')
    });
    next();
});

// Performance metrics middleware
app.use(performanceMetrics);

// Global rate limiter
app.use('/api/', apiLimiter);

// Route specific rate limiters
app.use('/api/auth', authLimiter);
app.use('/api/products', productLimiter);
app.use('/api/users', userLimiter);
app.use('/api/orders', orderLimiter);
app.use('/api/stocks', stockLimiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/products', productRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/address', addressRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/stocks', stockRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/reviews', reviewRoutes);

// 404 handler
app.use((req, res, next) => {
    res.status(404).json({
        success: false,
        message: 'İstenen kaynak bulunamadı'
    });
});

app.use((err, req, res, next) => {
    // Detaylı hata logu
    console.log('\n=== HATA DETAYI ===');
    console.log('Zaman:', new Date().toISOString());
    console.log('URL:', req.originalUrl);
    console.log('Metod:', req.method);
    console.log('Origin:', req.headers.origin);
    console.log('User Agent:', req.headers['user-agent']);
    console.log('Cookies:', req.cookies);
    console.log('Hata Mesajı:', err.message);
    console.log('Hata Stack:', err.stack);
    console.log('==================\n');

    logger.error('Uygulama hatası:', {
        error: err.message,
        stack: err.stack,
        path: req.path,
        method: req.method,
        origin: req.headers.origin
    });


    // Mongoose validation hatası kontrolü
    if (err.name === 'ValidationError') {
        return res.status(400).json({
            success: false,
            message: 'Validasyon hatası',
            errors: Object.values(err.errors).map(e => e.message)
        });
    }

    // JWT hatası kontrolü
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
        return res.status(401).json({
            success: false,
            message: 'Geçersiz veya süresi dolmuş token'
        });
    }

    // CORS hatası kontrolü
    if (err.message === 'CORS policy violation') {
        return res.status(403).json({
            success: false,
            message: 'CORS policy violation'
        });
    }

    res.status(err.status || 500).json({
        success: false,
        message: process.env.NODE_ENV === 'development' ? err.message : 'Bir hata oluştu!'
    });
});

// Graceful shutdown handler
const gracefulShutdown = () => {
    logger.info('Uygulama kapatılıyor...');

    // MongoDB bağlantısını kapat
    mongoose.connection.close(false, () => {
        logger.info('MongoDB bağlantısı kapatıldı');
        process.exit(0);
    });

    // 10 saniye içinde kapanmazsa zorla kapat
    setTimeout(() => {
        logger.error('Zorla kapatılıyor');
        process.exit(1);
    }, 10000);
};

// Shutdown sinyallerini dinle
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// DB Connection
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
    .then(async () => {
        logger.info('MongoDB bağlantısı başarılı');

        // Index yönetimi
        await initializeIndexes();
        logger.info('Database indexes initialized');

        // Sunucuyu aktif tutmak için cron job
        cron.schedule('*/14 * * * *', () => {
            logger.info('Cron job çalıştı: Sunucu aktif tutuluyor');
            // Basit bir işlem yaparak sunucuyu aktif tut
            mongoose.connection.db.admin().ping();
        });
    })
    .catch(err => {
        logger.error('MongoDB bağlantı hatası:', err);
        process.exit(1);
    });

// Mongoose bağlantı olaylarını dinle
mongoose.connection.on('error', err => {
    logger.error('MongoDB bağlantı hatası:', err);
});

mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB bağlantısı koptu');
});

// HTTP sunucusunu başlat
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
    logger.info(`Sunucu ${PORT} portunda çalışıyor`);
    logger.info(`Frontend URL: ${process.env.FRONTEND_URL || "http://localhost:5173"}`);
});
