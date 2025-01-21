// routes/payment.routes.js
import express from 'express';
import PaymentController from '../controllers/payment.controller.js';
import PaymentMiddleware from '../middleware/payment.middleware.js';
import { verifyToken, isAdmin } from '../middlewares/auth.middleware.js';
import {
    paymentInitiateLimiter,
    payment3DCallbackLimiter,
    paymentStatusLimiter,
    paymentRefundLimiter
} from '../middlewares/rateLimiter.middleware.js';
import paymentCallbackCors from '../middlewares/payment.cors.middleware.js';

const router = express.Router();

// iFrame kullanımını engelle
router.use(PaymentMiddleware.preventIframeUsage);

/**
 * @route   POST /api/payments/initiate/:orderId
 * @desc    3D Secure ödeme başlat
 * @access  Private
 */
router.post('/initiate/:orderId',
    verifyToken,
    paymentInitiateLimiter,
    PaymentMiddleware.validateCardDetails,
    PaymentMiddleware.validateOrderStatus,
    PaymentMiddleware.checkIPAndRateLimit,
    (req, res) => PaymentController.initiatePayment(req, res)
);

/**
 * @route   POST /api/payments/initiate-ktlp/:orderId
 * @desc    KTLP ödeme başlat
 * @access  Private
 */
router.post('/initiate-ktlp/:orderId',
    verifyToken,
    paymentInitiateLimiter,
    PaymentMiddleware.validateCardDetails,
    PaymentMiddleware.validateOrderStatus,
    PaymentMiddleware.checkIPAndRateLimit,
    PaymentController.initiateKTLPayment
);

/**
 * @route   POST /api/payments/callback/success
 * @desc    3D Secure başarılı callback
 * @access  Public
 */
router.post('/callback/success',
    paymentCallbackCors,
    payment3DCallbackLimiter,
    PaymentMiddleware.validate3DCallback,
    (req, res) => PaymentController.handleCallback(req, res)
);

/**
 * @route   POST /api/payments/callback/fail
 * @desc    3D Secure başarısız callback
 * @access  Public
 */
router.post('/callback/fail',
    paymentCallbackCors,
    payment3DCallbackLimiter,
    PaymentMiddleware.validate3DCallback,
    (req, res) => PaymentController.handleCallback(req, res)
);

/**
 * @route   GET /api/payments/status/:paymentId
 * @desc    Ödeme durumu sorgula
 * @access  Private
 */
router.get('/status/:paymentId',
    verifyToken,
    paymentStatusLimiter,
    (req, res) => PaymentController.getPaymentStatus(req, res)
);

/**
 * @route   POST /api/payments/refund/:paymentId
 * @desc    İptal/İade işlemi
 * @access  Private + Admin
 */
router.post('/refund/:paymentId',
    verifyToken,
    isAdmin,
    paymentRefundLimiter,
    PaymentMiddleware.validateRefund,
    (req, res) => PaymentController.refundPayment(req, res)
);

/**
 * @route   GET /api/payments/user
 * @desc    Kullanıcının ödemelerini listele
 * @access  Private
 */
router.get('/user',
    verifyToken,
    async (req, res) => {
        try {
            const payments = await Payment.find({ userId: req.user._id })
                .select('-cardDetails.cvv')
                .populate('orderId', 'status totalAmount items')
                .sort({ createdAt: -1 });

            res.json({
                success: true,
                data: payments
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }
);

/**
 * @route   GET /api/payments/admin/list
 * @desc    Tüm ödemeleri listele (Admin)
 * @access  Private (Admin)
 */
router.get('/admin/list',
    verifyToken,
    isAdmin,
    async (req, res) => {
        try {
            const { status, startDate, endDate, page = 1, limit = 10 } = req.query;

            const query = {};

            // Status filtresi
            if (status) {
                query.status = status;
            }

            // Tarih filtresi
            if (startDate || endDate) {
                query.createdAt = {};
                if (startDate) query.createdAt.$gte = new Date(startDate);
                if (endDate) query.createdAt.$lte = new Date(endDate);
            }

            const options = {
                page: parseInt(page),
                limit: parseInt(limit),
                sort: { createdAt: -1 },
                populate: {
                    path: 'orderId',
                    select: 'status totalAmount items user'
                },
                select: '-cardDetails.cvv'
            };

            const payments = await Payment.paginate(query, options);

            res.json({
                success: true,
                data: payments
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }
);

// Hata yakalama middleware'i
router.use(PaymentMiddleware.errorHandler);

export default router;
