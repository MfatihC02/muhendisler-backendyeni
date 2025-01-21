// routes/stock.routes.js
import express from 'express';
import StockController from '../controllers/stock.controller.js';
import { verifyToken, isAdmin } from '../middlewares/auth.middleware.js';
import { validateStock, validateReservation, validateStockUpdate } from '../middlewares/stock.validator.js';
import { cacheMiddleware, clearCacheMiddleware } from '../middleware/performance/cache.js';

const router = express.Router();

// Stok yönetimi rotaları
router.get(
    '/product/:id/availability',
    [verifyToken, cacheMiddleware('stock')],
    StockController.checkAvailability
);

router.get(
    '/product/:id',
    [verifyToken, cacheMiddleware('stock')],
    StockController.getStockByProduct
);

// Ürün slug'ına göre stok bilgisi
router.get('/product/slug/:slug', 
    [cacheMiddleware('stock')],
    StockController.getStockByProductSlug
);

router.post(
    '/',
    [verifyToken, isAdmin, validateStock, clearCacheMiddleware('stock')],
    StockController.createStock
);

// Stok güncelleme
router.put(
    '/product/:id',
    [verifyToken, isAdmin, validateStockUpdate, clearCacheMiddleware(['stock', 'product'])],
    StockController.updateStock
);

// Cart rezervasyonu
router.post(
    '/product/:id/cart-reservation',
    [verifyToken, validateReservation, clearCacheMiddleware('stock')],
    StockController.createCartReservation
);

// Checkout rezervasyonu
router.post(
    '/product/:id/checkout-reservation',
    [verifyToken, validateReservation, clearCacheMiddleware('stock')],
    (req, res, next) => {
        console.log('=== Checkout Rezervasyon Route Debug ===');
        console.log('URL:', req.originalUrl);
        console.log('Method:', req.method);
        console.log('Params:', req.params);
        console.log('Body:', req.body);
        console.log('User:', req.user);
        console.log('Headers:', req.headers);
        next();
    },
    StockController.createCheckoutReservation   
);

// Rezervasyon onaylama
router.patch(
    '/reservations/:reservationId/confirm',
    [verifyToken, clearCacheMiddleware('stock')],
    StockController.confirmReservation
);

// Rezervasyon iptal
router.delete(
    '/reservations/:reservationId',
    [verifyToken, clearCacheMiddleware('stock')],
    StockController.cancelReservation
);

// Stok yönetimi rotaları (Admin)
router.get('/:productId', 
    [verifyToken, cacheMiddleware('stock')],
    StockController.getStock
);

// Rezervasyon yönetimi rotaları
router.get('/reservations/:productId/status', 
    [verifyToken, cacheMiddleware('stock')],
    StockController.checkReservationStatus
);
router.post('/reservations/:reservationId/extend', 
    [verifyToken, clearCacheMiddleware('stock')],
    StockController.extendReservation
);
router.post('/reservations/batch', 
    [verifyToken, clearCacheMiddleware('stock')],
    StockController.createBatchReservations
);
router.get('/reservations/:productId/availability', 
    [verifyToken, cacheMiddleware('stock')],
    StockController.validateStockAvailability
);
router.post('/reservations/checkout', 
    [verifyToken, clearCacheMiddleware('stock')],
    StockController.createCheckoutReservation
);
router.post('/reservations/:reservationId/confirm', 
    [verifyToken, clearCacheMiddleware('stock')],
    StockController.confirmReservation
);
router.post('/reservations/:reservationId/cancel', 
    [verifyToken, clearCacheMiddleware('stock')],
    StockController.cancelReservation
);

export default router;