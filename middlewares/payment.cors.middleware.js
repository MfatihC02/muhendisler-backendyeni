// payment.cors.middleware.js
import cors from 'cors';
import { PaymentLogger } from '../utils/payment.utils.js';

// 3D Secure callback rotaları için özel CORS yapılandırması
const callbackCorsOptions = {
    origin: function (origin, callback) {
        // origin null olabilir (postback durumunda)
        callback(null, true);
    },
    methods: ['POST', 'OPTIONS'],
    allowedHeaders: [
        'Content-Type',
        'Authorization',
        'Cache-Control',
        'X-Requested-With'
    ],
    credentials: true
};

// CORS hata yakalama ve loglama ile
const paymentCallbackCors = (req, res, next) => {
    // İsteği logla
    PaymentLogger.debug('3D_CALLBACK_CORS', '3D Secure callback isteği alındı', {
        origin: req.headers.origin || 'null',
        method: req.method,
        path: req.path,
        contentType: req.headers['content-type'],
        allHeaders: req.headers // Tüm headers'ı logla
    });

    // CORS middleware'ini çalıştır
    cors(callbackCorsOptions)(req, res, (err) => {
        if (err) {
            PaymentLogger.error('3D_CALLBACK_CORS_ERROR', 'CORS hatası', {
                error: err.message,
                origin: req.headers.origin || 'null',
                method: req.method,
                stack: err.stack
            });
            return res.status(403).json({
                success: false,
                message: 'CORS hatası: İzinsiz origin'
            });
        }
        
        // CORS başarılı log
        PaymentLogger.debug('3D_CALLBACK_CORS_SUCCESS', 'CORS kontrolü başarılı', {
            origin: req.headers.origin || 'null',
            method: req.method
        });
        
        next();
    });
};

export default paymentCallbackCors;
