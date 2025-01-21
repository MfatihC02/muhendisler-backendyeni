// middleware/payment.middleware.js
import { Order } from '../models/order.model.js';
import { Payment } from '../models/payment.model.js';
import { PaymentLogger } from '../utils/payment.utils.js';
// Kart numarası validasyonu için Luhn algoritması
const validateCardNumber = (cardNumber) => {
    if (!cardNumber || typeof cardNumber !== 'string') return false;
    
    // Sadece rakamları al
    const digits = cardNumber.replace(/\D/g, '');
    if (digits.length !== 16) return false;

    // Luhn algoritması
    let sum = 0;
    let isEven = false;

    for (let i = digits.length - 1; i >= 0; i--) {
        let digit = parseInt(digits[i]);

        if (isEven) {
            digit *= 2;
            if (digit > 9) {
                digit -= 9;
            }
        }

        sum += digit;
        isEven = !isEven;
    }

    return sum % 10 === 0;
};

// Yardımcı fonksiyonlar
const validatePhoneNumber = (phone) => {
    if (!phone || !phone.Cc || !phone.Subscriber) return false;
    return /^[0-9]{2}$/.test(phone.Cc) && /^[0-9]{10}$/.test(phone.Subscriber);
};

const validatePostCode = (postCode) => {
    return /^[0-9]{5}$/.test(postCode);
};

const validateEmail = (email) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

const PaymentMiddleware = {
    // iFrame kullanımını engelleme
    preventIframeUsage(req, res, next) {
        res.setHeader('X-Frame-Options', 'DENY');
        next();
    },

    // Kart bilgilerini validate et
    validateCardDetails(req, res, next) {
        try {
            const { CardNumber, CardExpireDateMonth, CardExpireDateYear, CardCVV2, CardHolderName, CardType } = req.body;

            // Kart numarası kontrolü
            if (!validateCardNumber(CardNumber)) {
                return res.status(400).json({
                    success: false,
                    message: 'Geçersiz kart numarası'
                });
            }

            // Son kullanma tarihi kontrolü
            const currentDate = new Date();
            const currentYear = currentDate.getFullYear() % 100; // Son 2 hane
            const currentMonth = currentDate.getMonth() + 1;

            const expYear = parseInt(CardExpireDateYear);
            const expMonth = parseInt(CardExpireDateMonth);

            if (expYear < currentYear || (expYear === currentYear && expMonth < currentMonth)) {
                return res.status(400).json({
                    success: false,
                    message: 'Kartın son kullanma tarihi geçmiş'
                });
            }

            // CVV kontrolü
            if (!CardCVV2 || !/^\d{3}$/.test(CardCVV2)) {
                return res.status(400).json({
                    success: false,
                    message: 'Geçersiz CVV'
                });
            }

            // Kart sahibi adı kontrolü
            if (!CardHolderName || CardHolderName.length < 5) {
                return res.status(400).json({
                    success: false,
                    message: 'Geçersiz kart sahibi adı'
                });
            }

            // Kart tipi kontrolü
            if (!['TROY', 'VISA', 'MASTERCARD'].includes(CardType)) {
                return res.status(400).json({
                    success: false,
                    message: 'Geçersiz kart tipi'
                });
            }

            next();
        } catch (error) {
            return res.status(400).json({
                success: false,
                message: 'Kart bilgileri eksik veya hatalı',
                error: error.message
            });
        }
    },

    // Kart sahibi bilgilerini doğrula
    validateCardHolderData(req, res, next) {
        try {
            const { CardHolderData } = req.body;

            if (!CardHolderData) {
                return res.status(400).json({
                    success: false,
                    message: 'Kart sahibi bilgileri eksik'
                });
            }

            const requiredFields = [
                'BillAddrCity',
                'BillAddrCountry',
                'BillAddrLine1',
                'BillAddrPostCode',
                'BillAddrState',
                'Email',
                'MobilePhone'
            ];

            // Zorunlu alanları kontrol et
            for (const field of requiredFields) {
                if (!CardHolderData[field]) {
                    return res.status(400).json({
                        success: false,
                        message: `${field} alanı zorunludur`
                    });
                }
            }

            // Posta kodu kontrolü
            if (!validatePostCode(CardHolderData.BillAddrPostCode)) {
                return res.status(400).json({
                    success: false,
                    message: 'Geçersiz posta kodu'
                });
            }

            // Email kontrolü
            if (!validateEmail(CardHolderData.Email)) {
                return res.status(400).json({
                    success: false,
                    message: 'Geçersiz email adresi'
                });
            }

            // Telefon numarası kontrolü
            if (!validatePhoneNumber(CardHolderData.MobilePhone)) {
                return res.status(400).json({
                    success: false,
                    message: 'Geçersiz telefon numarası'
                });
            }

            // Ülke kodu kontrolü (792 - Türkiye)
            if (CardHolderData.BillAddrCountry !== '792') {
                return res.status(400).json({
                    success: false,
                    message: 'Geçersiz ülke kodu'
                });
            }

            // İl kodu kontrolü (1-81 arası)
            const stateCode = parseInt(CardHolderData.BillAddrState);
            if (isNaN(stateCode) || stateCode < 1 || stateCode > 81) {
                return res.status(400).json({
                    success: false,
                    message: 'Geçersiz il kodu'
                });
            }

            next();
        } catch (error) {
            return res.status(400).json({
                success: false,
                message: 'Kart sahibi bilgileri doğrulanamadı',
                error: error.message
            });
        }
    },

    // Cihaz verilerini doğrula
    validateDeviceData(req, res, next) {
        try {
            const { deviceData } = req.body;

            if (!deviceData) {
                return res.status(400).json({
                    success: false,
                    message: 'Cihaz bilgileri eksik'
                });
            }

            // DeviceChannel kontrolü (sabit değer: 02)
            if (deviceData.DeviceChannel !== '02') {
                return res.status(400).json({
                    success: false,
                    message: 'Geçersiz DeviceChannel değeri'
                });
            }

            // IP adresi kontrolü
            const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
            if (!deviceData.ClientIP || !ipRegex.test(deviceData.ClientIP)) {
                return res.status(400).json({
                    success: false,
                    message: 'Geçersiz IP adresi'
                });
            }

            next();
        } catch (error) {
            next(error);
        }
    },

    // Sipariş durumunu kontrol et
    async validateOrderStatus(req, res, next) {
        try {
            const { orderId } = req.params;
            const order = await Order.findById(orderId);

            if (!order) {
                return res.status(404).json({
                    success: false,
                    message: 'Sipariş bulunamadı'
                });
            }

            // Sipariş durumu kontrolü
            if (order.status !== 'CREATED' && order.status !== 'PENDING_PAYMENT') {
                return res.status(400).json({
                    success: false,
                    message: 'Sipariş durumu ödeme için uygun değil'
                });
            }

            // Mevcut ödeme kontrolü
            const existingPayment = await Payment.findOne({ orderId, status: { $nin: ['FAILED', 'CANCELLED'] } });
            if (existingPayment) {
                return res.status(400).json({
                    success: false,
                    message: 'Bu sipariş için zaten bir ödeme işlemi başlatılmış'
                });
            }

            req.order = order;
            next();
        } catch (error) {
            next(error);
        }
    },

    // 3D Secure callback doğrulama
    validate3DCallback(req, res, next) {
        try {
            // AuthenticationResponse varlığını kontrol et
            if (!req.body.AuthenticationResponse) {
                PaymentLogger.error('3D_CALLBACK_VALIDATION', 'AuthenticationResponse eksik', {
                    bodyKeys: Object.keys(req.body)
                });
                return res.status(400).json({
                    success: false,
                    message: 'Geçersiz 3D Secure yanıtı: AuthenticationResponse eksik'
                });
            }

            // Raw body'i logla
            PaymentLogger.debug('3D_CALLBACK_VALIDATION', 'Request body kontrolü', {
                hasAuthResponse: true,
                authResponseLength: req.body.AuthenticationResponse.length,
                contentType: req.headers['content-type']
            });

            next();
        } catch (error) {
            PaymentLogger.error('3D_CALLBACK_VALIDATION_ERROR', 'Validation hatası', {
                error: error.message,
                stack: error.stack
            });
            next(error);
        }
    },

    // İade işlemi kontrolü
    async validateRefund(req, res, next) {
        try {
            const { paymentId } = req.params;
            const payment = await Payment.findById(paymentId);

            if (!payment) {
                return res.status(404).json({
                    success: false,
                    message: 'Ödeme kaydı bulunamadı'
                });
            }

            if (!payment.canBeRefunded()) {
                return res.status(400).json({
                    success: false,
                    message: 'Bu ödeme iade edilemez durumda'
                });
            }

            // İade sebebi kontrolü
            if (!req.body.reason || req.body.reason.length < 10) {
                return res.status(400).json({
                    success: false,
                    message: 'Geçerli bir iade sebebi belirtilmeli'
                });
            }

            req.payment = payment;
            next();
        } catch (error) {
            next(error);
        }
    },

    // IP adresi kontrolü ve rate limiting
    checkIPAndRateLimit(req, res, next) {
        const clientIp = req.ip || req.connection.remoteAddress;
        
        // Rate limiting kontrolü burada yapılabilir
        // Redis veya başka bir cache mekanizması kullanılabilir

        req.clientIp = clientIp;
        next();
    },

    // Hata yakalama middleware
    errorHandler(err, req, res, next) {
        console.error('Payment Error:', err);

        // Özel hata mesajları
        if (err.name === 'ValidationError') {
            return res.status(400).json({
                success: false,
                message: 'Validasyon hatası',
                errors: Object.values(err.errors).map(e => e.message)
            });
        }

        // Axios hataları
        if (err.isAxiosError) {
            return res.status(err.response?.status || 500).json({
                success: false,
                message: 'Ödeme servisi hatası',
                error: err.response?.data || err.message
            });
        }

        // Genel hatalar
        res.status(500).json({
            success: false,
            message: 'Bir hata oluştu',
            error: process.env.NODE_ENV === 'development' ? err.message : 'Internal Server Error'
        });
    }
};

export default PaymentMiddleware;
