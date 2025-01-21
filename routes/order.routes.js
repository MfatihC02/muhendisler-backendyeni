// routes/order.routes.js
import express from 'express';
import OrderController from '../controllers/order.controller.js';
import { validateCreateOrder, validateUpdateOrder } from '../middlewares/order.validator.js';
import { verifyToken, isAdmin } from '../middlewares/auth.middleware.js';
import { cacheMiddleware, clearCacheMiddleware } from '../middleware/performance/cache.js';

const router = express.Router();

// Müşteri rotaları
router.post(
    '/',
    [verifyToken, validateCreateOrder],
    clearCacheMiddleware(['order', 'stock']), // Sipariş ve stok cache'ini temizle
    OrderController.createOrder
);

router.get(
    '/:id',
    verifyToken,
    cacheMiddleware('order', 30), // 30 saniye cache
    OrderController.getOrder
);

router.get(
    '/user/orders',
    verifyToken,
    cacheMiddleware('order', 60), // 1 dakika cache
    OrderController.getUserOrders
);

router.patch(
    '/:orderId/status',
    [verifyToken, validateUpdateOrder],
    clearCacheMiddleware(['order']),
    OrderController.updateOrderStatus
);

router.post(
    '/:id/cancel',
    verifyToken,
    clearCacheMiddleware(['order', 'stock']), // İptal edilince stok da güncellenir
    OrderController.cancelOrder
);

// Admin rotaları
router.get(
    '/admin/all',
    [verifyToken, isAdmin],
    cacheMiddleware('order', 120), // 2 dakika cache
    OrderController.getAllOrders
);

router.patch(
    '/admin/:orderId/status',
    [verifyToken, isAdmin],
    clearCacheMiddleware(['order']),
    OrderController.adminUpdateOrderStatus
);

router.get(
    '/admin/stats',
    [verifyToken, isAdmin],
    cacheMiddleware('order', 300), // 5 dakika cache - istatistikler daha uzun cachlenebilir
    OrderController.getOrderStats
);

router.patch(
    '/admin/:orderId',
    [verifyToken, isAdmin],
    clearCacheMiddleware(['order']),
    OrderController.adminUpdateOrder
);

export default router; 