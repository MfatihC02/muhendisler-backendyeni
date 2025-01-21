// controllers/payment.controller.js
import { Payment } from '../models/payment.model.js';
import { Order } from '../models/order.model.js';
import { Stock } from '../models/stock.model.js';
import StockReservation from '../models/stockReservation.model.js';
import axios from 'axios';
import {
    PaymentLogger,
    createKTXmlRequest,
    parseKTResponse,
    calculateHash,
    formatAmount,
    formatCardHolderData,
    maskSensitiveData,
    logPaymentDetails,
    logRequestDetails,
    prepareDeviceData,
    emitPaymentEvent,
    paymentCache,
    transformPaymentDataToKTFormat,
    validateTransformedData,
    ThreeDSecureUtils,
    createKTPaymentRequest
} from '../utils/payment.utils.js';
import { KuveytTurkConfig } from '../config/kuveytturk.config.js';
import * as xmlbuilder from 'xmlbuilder';
import mongoose from 'mongoose';

const PaymentController = {
    // Ödeme başlatma
    async initiatePayment(req, res) {
        try {
            const { body: paymentData } = req;
            const orderId = req.params.orderId;
            const clientIp = req.ip || req.connection.remoteAddress;

            // Ham veriyi logla
            PaymentLogger.debug('RAW_PAYMENT_REQUEST', 'Ham ödeme verisi alındı', {
                requestBody: maskSensitiveData(paymentData),
                orderId,
                clientIp
            });

            // Order kontrolü
            const order = await Order.findById(orderId);
            if (!order) {
                throw new Error('Sipariş bulunamadı');
            }

            // Payment kaydı oluştur
            const formattedAmount = formatAmount(paymentData.Amount);
            const payment = new Payment({
                orderId: order._id,
                merchantOrderId: order._id.toString(),
                CardNumber: paymentData.CardNumber,
                CardHolderName: paymentData.CardHolderName,
                CardExpireDateMonth: paymentData.CardExpireDateMonth,
                CardExpireDateYear: paymentData.CardExpireDateYear,
                CardType: paymentData.CardType,
                Amount: formattedAmount,
                DisplayAmount: paymentData.Amount,
                CurrencyCode: paymentData.CurrencyCode || '0949',
                TransactionType: 'Sale',
                TransactionSecurity: '3',
                InstallmentCount: paymentData.InstallmentCount || 0,
                status: 'PENDING',
                threeDSecure: {
                    status: 'PENDING'
                },
                CardHolderData: {
                    Email: paymentData.Email,
                    MobilePhone: {
                        Cc: paymentData.MobilePhoneCC,
                        Subscriber: paymentData.MobilePhone
                    }
                }
            });

            // Payment kaydını kaydet
            await payment.save();

            PaymentLogger.info('PAYMENT_RECORD_CREATED', 'Ödeme kaydı oluşturuldu', {
                paymentId: payment._id,
                orderId: order._id,
                merchantOrderId: payment.merchantOrderId
            });

            // OrderId'yi payment data'ya ekle
            const enrichedPaymentData = {
                ...paymentData,
                MerchantOrderId: payment.merchantOrderId
            };

            // Veri dönüşümü
            const transformedData = transformPaymentDataToKTFormat(enrichedPaymentData, clientIp);

            // Veri doğrulama
            validateTransformedData(transformedData);

            // XML oluştur
            const xmlRequest = await createKTXmlRequest(transformedData);

            // KT'ye istek at
            const ktEndpoint = KuveytTurkConfig.urls.baseUrl + KuveytTurkConfig.urls.endpoints.threeDPayGate;
            
            PaymentLogger.debug('KT_REQUEST_SENT', 'Kuveyt Türk\'e istek gönderiliyor', {
                endpoint: ktEndpoint,
                xmlLength: xmlRequest.length,
                merchantOrderId: payment.merchantOrderId
            });

            const response = await axios.post(ktEndpoint, xmlRequest, {
                headers: {
                    'Content-Type': 'application/xml'
                }
            });

            // Yanıtı parse et
            const parsedResponse = await parseKTResponse(response.data);

            // Raw request/response kaydet
            payment.raw = {
                request: xmlRequest,
                response: response.data
            };
            await payment.save();

            // 3D Secure kontrolü ve yanıt
            if (parsedResponse.is3DSecure) {
                PaymentLogger.info('3D_SECURE_REDIRECT', '3D Secure yönlendirmesi başlatılıyor', {
                    paymentId: payment._id,
                    orderId: order._id,
                    merchantOrderId: payment.merchantOrderId,
                    redirectUrl: parsedResponse.formData.action
                });

                return res.status(200).json({
                    success: true,
                    data: {
                        is3DSecure: true,
                        formData: parsedResponse.formData,
                        redirectUrl: parsedResponse.formData.action
                    }
                });
            }

            // Normal ödeme yanıtı
            return res.status(200).json({
                success: true,
                data: parsedResponse
            });

        } catch (error) {
            PaymentLogger.error('PAYMENT_ERROR', error, {
                requestData: {
                    body: maskSensitiveData(req.body),
                    orderId: req.params.orderId,
                    clientIp: req.ip
                }
            });

            return res.status(500).json({
                success: false,
                error: {
                    message: error.message,
                    code: error.code || 'UNKNOWN_ERROR'
                }
            });
        }
    },

    // 3D Secure callback işleme
    async handleCallback(req, res) {
        try {
            PaymentLogger.debug('3D_CALLBACK_REQUEST', 'Callback request detayları', {
                method: req.method,
                path: req.path,
                headers: req.headers,
                bodySize: JSON.stringify(req.body).length,
                hasAuthResponse: !!req.body.AuthenticationResponse
            });
            
            // AuthenticationResponse kontrolü
            if (!req.body.AuthenticationResponse) {
                PaymentLogger.error('3D_CALLBACK_NO_AUTH', 'AuthenticationResponse bulunamadı', {
                    body: maskSensitiveData(req.body),
                    headers: req.headers
                });
                throw new Error('AuthenticationResponse bulunamadı');
            }

            // AuthenticationResponse'u al
            const authResponse = req.body.AuthenticationResponse;

            PaymentLogger.debug('3D_AUTH_RESPONSE', 'AuthenticationResponse içeriği', {
                responseLength: authResponse.length,
                isXML: authResponse.includes('<?xml'),
                firstChars: authResponse.substring(0, 100),
                lastChars: authResponse.substring(authResponse.length - 100)
            });

            // XML'i parse et ve gerekli verileri çıkar
            const parsedResponse = await ThreeDSecureUtils.decodeAndParseAuthResponse(authResponse);
            
            PaymentLogger.debug('3D_CALLBACK_PARSED', 'Parse edilmiş yanıt', {
                hasVPosContract: !!parsedResponse?.VPosTransactionResponseContract,
                hasVPosMessage: !!parsedResponse?.VPosMessage,
                topLevelKeys: Object.keys(parsedResponse || {}),
                responseCode: parsedResponse?.VPosTransactionResponseContract?.ResponseCode || parsedResponse?.ResponseCode
            });

            const extractedData = ThreeDSecureUtils.extract3DSecureData(parsedResponse);

            PaymentLogger.debug('3D_CALLBACK_EXTRACTED', 'Çıkarılan veri', {
                responseCode: extractedData.responseCode,
                responseMessage: extractedData.responseMessage,
                hasOrderId: !!extractedData.orderId,
                hasMD: !!extractedData.md,
                hasHashData: !!extractedData.hashData
            });

            // 3D Secure yanıtını validate et
            ThreeDSecureUtils.validate3DSecureResponse(extractedData);

            // Sipariş ve ödeme kayıtlarını bul
            PaymentLogger.debug('3D_CALLBACK_DB_SEARCH', 'Veritabanı kayıtları aranıyor', {
                merchantOrderId: extractedData.merchantOrderId
            });

            const [payment, order] = await Promise.all([
                Payment.findOne({ merchantOrderId: extractedData.merchantOrderId }),
                Order.findById(extractedData.merchantOrderId)
            ]);

            if (!payment || !order) {
                PaymentLogger.error('3D_CALLBACK_DB_NOT_FOUND', 'Kayıtlar bulunamadı', {
                    hasPayment: !!payment,
                    hasOrder: !!order,
                    merchantOrderId: extractedData.merchantOrderId
                });
                throw new Error('Ödeme veya sipariş kaydı bulunamadı');
            }

            PaymentLogger.debug('3D_CALLBACK_DB_FOUND', 'Kayıtlar bulundu', {
                paymentId: payment._id,
                orderId: order._id,
                paymentStatus: payment.status,
                orderStatus: order.status
            });

            // Payment kaydını güncelle
            payment.bankOrderId = extractedData.orderId;
            payment.threeDSecure = {
                status: extractedData.responseCode === '00' ? 'SUCCESS' : 'FAILED',
                responseCode: extractedData.responseCode,
                responseMessage: extractedData.responseMessage,
                md: extractedData.md
            };

            // Raw response'u kaydet
            payment.raw = {
                ...payment.raw,
                threeDResponse: parsedResponse
            };

            await payment.save();

            PaymentLogger.info('3D_CALLBACK_PAYMENT_UPDATED', 'Ödeme kaydı güncellendi', {
                paymentId: payment._id,
                orderId: order._id,
                merchantOrderId: payment.merchantOrderId,
                bankOrderId: payment.bankOrderId,
                responseCode: extractedData.responseCode,
                status: payment.threeDSecure.status
            });

            // 3D Secure başarılı ise ödemeyi tamamla
            if (extractedData.responseCode === '00') {
                await this.completePayment(payment, order, extractedData);
                
                // Query params ile frontend'e yönlendir
                return res.redirect(`${process.env.FRONTEND_URL}/payment/success?orderId=${order._id}&status=success&paymentId=${payment._id}`);
            }

            // 3D Secure başarısız - Rezervasyonları CART'a çevir ve süreyi uzat
            payment.status = 'FAILED';
            payment.errorDetails = {
                code: extractedData.responseCode,
                message: extractedData.responseMessage
            };
            await payment.save();

            // Rezervasyonları güncelle
            const reservationPromises = order.items.map(async (item) => {
                const reservation = await StockReservation.findOne({
                    _id: item.reservationId,
                    status: 'CHECKOUT'
                });

                if (reservation) {
                    reservation.status = 'CART';
                    reservation.expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 dakika
                    await reservation.save();
                }
            });

            await Promise.all(reservationPromises);

            PaymentLogger.info('PAYMENT_FAILED_RESERVATION_RESET', 'Ödeme başarısız, rezervasyonlar sepete geri alındı', {
                paymentId: payment._id,
                orderId: order._id,
                responseCode: extractedData.responseCode,
                responseMessage: extractedData.responseMessage
            });

            // Frontend'e yönlendir
            return res.redirect(
                `${process.env.FRONTEND_URL}/payment/failed?` +
                `orderId=${order._id}&` +
                `error=${encodeURIComponent(extractedData.responseMessage)}&` +
                `code=${extractedData.responseCode}`
            );

        } catch (error) {
            PaymentLogger.error('3D_CALLBACK_ERROR', error.message, {
                message: error.message,
                code: error.code || 'UNKNOWN_ERROR',
                stack: error.stack,
                errorType: error.constructor.name,
                errorMessage: error.message,
                errorStack: error.stack,
                stage: error.stage || 'UNKNOWN',
                requestBody: maskSensitiveData(req.body)
            });

            return res.status(500).json({
                success: false,
                error: {
                    message: error.message,
                    code: error.code || 'UNKNOWN_ERROR'
                }
            });
        }
    },

    // Ödeme tamamlama
    async completePayment(payment, order, threeDResponse) {
        try {
            PaymentLogger.debug('COMPLETE_PAYMENT_START', 'Ödeme tamamlama başladı', {
                paymentId: payment._id,
                orderId: order._id,
                threeDResponse: maskSensitiveData(threeDResponse)
            });

            // Stok kontrolü
            const stockCheckPromises = order.items.map(async (item) => {
                // Önce rezervasyonu bul
                const reservation = await StockReservation.findById(item.stockReservationId);
                if (!reservation) {
                    throw new Error(`Rezervasyon bulunamadı: ${item.stockReservationId}`);
                }

                // Rezervasyonun doğru ürüne ait olduğunu kontrol et
                if (reservation.product.toString() !== item.product.toString()) {
                    throw new Error(`Rezervasyon yanlış ürüne ait: ${item.product}`);
                }

                // Stok kaydını bul
                const stock = await Stock.findOne({
                    product: item.product
                });

                if (!stock) {
                    throw new Error(`Ürün stoku bulunamadı: ${item.product}`);
                }

                // Stok miktarı kontrolü
                if (stock.quantity < item.quantity) {
                    throw new Error(`Yetersiz stok: ${item.product}`);
                }

                return { stock, item, reservation };
            });

            const stockChecks = await Promise.all(stockCheckPromises);
            PaymentLogger.debug('STOCK_CHECK_COMPLETE', 'Stok kontrolleri tamamlandı', {
                stockChecks: stockChecks.map(check => ({
                    productId: check.item.product,
                    quantity: check.item.quantity,
                    available: check.stock.quantity
                }))
            });

            // 3D Secure ödeme verilerini hazırla
            const paymentData = ThreeDSecureUtils.prepare3DSecurePaymentData(
                threeDResponse,
                order.totalAmount
            );

            // Provision XML oluştur
            const provisionXml = createKTPaymentRequest(paymentData);

            PaymentLogger.debug('PROVISION_REQUEST_READY', 'Provision XML hazır', {
                xmlLength: provisionXml.length
            });

            // Provision isteği gönder
            const response = await axios.post(
                KuveytTurkConfig.urls.baseUrl + KuveytTurkConfig.urls.endpoints.threeDProvisionGate,
                provisionXml,
                {
                    headers: { 'Content-Type': 'application/xml' }
                }
            );
            
            PaymentLogger.debug('PROVISION_RESPONSE', 'Provision yanıtı alındı', {
                responseStatus: response.status,
                responseData: response.data
            });

            // Yanıtı parse et
            const result = await parseKTResponse(response.data);

            if (result.success) {
                // Başarılı ödeme işlemleri
                payment.status = 'COMPLETED';
                payment.provisionResponse = {
                    transactionId: result.transactionId,
                    referenceId: result.referenceId,
                    responseCode: result.responseCode,
                    responseMessage: result.responseMessage,
                    rawResponse: maskSensitiveData(result)
                };
                await payment.save();

                // Sipariş güncelleme
                order.status = 'PAYMENT_COMPLETED';
                order.paymentDetails = {
                    status: 'COMPLETED',
                    transactionId: result.transactionId,
                    paymentDate: new Date()
                };
                await order.save();

                // Stok güncelleme
                const session = await mongoose.startSession();
                try {
                    session.startTransaction();
                    
                    const stockUpdatePromises = stockChecks.map(async ({ stock, item, reservation }) => {
                        // Rezervasyonu onayla
                        await reservation.confirm(session);

                        // Stok miktarını güncelle
                        await Stock.findOneAndUpdate(
                            { _id: stock._id },
                            { 
                                $inc: { 
                                    quantity: -item.quantity,  // Gerçek stoktan düş
                                    reservedQuantity: -item.quantity  // Rezervasyonu kaldır
                                }
                            },
                            { 
                                session,
                                new: true,  // Güncel dokümanı döndür
                                runValidators: true  // Validasyonları çalıştır
                            }
                        );

                        PaymentLogger.debug('STOCK_UPDATED', 'Stok güncellendi', {
                            stockId: stock._id,
                            productId: item.product,
                            quantity: item.quantity,
                            newQuantity: stock.quantity - item.quantity,
                            newReservedQuantity: stock.reservedQuantity - item.quantity
                        });

                        return { success: true };
                    });

                    // Tüm güncellemeleri bekle
                    await Promise.all(stockUpdatePromises);

                    // Transaction'ı commit et
                    await session.commitTransaction();
                    PaymentLogger.info('STOCK_UPDATE_SUCCESS', 'Tüm stok güncellemeleri başarılı');

                } catch (error) {
                    // Hata durumunda rollback yap
                    await session.abortTransaction();
                    PaymentLogger.error('STOCK_UPDATE_ERROR', 'Stok güncelleme hatası', { error });
                    throw error;
                } finally {
                    // Session'ı kapat
                    session.endSession();
                }

                PaymentLogger.info('PAYMENT_COMPLETED', 'Ödeme başarıyla tamamlandı', {
                    paymentId: payment._id,
                    orderId: order._id,
                    transactionId: result.transactionId
                });

                return {
                    success: true,
                    transactionId: result.transactionId,
                    message: 'Ödeme başarıyla tamamlandı'
                };
            } else {
                // Başarısız ödeme işlemleri
                payment.status = 'FAILED';
                payment.error = {
                    code: result.responseCode,
                    message: result.responseMessage
                };
                await payment.save();

                // Sipariş güncelleme
                order.status = 'FAILED';
                order.paymentDetails = {
                    status: 'FAILED',
                    error: {
                        code: result.responseCode,
                        message: result.responseMessage
                    }
                };
                await order.save();

                // Stok rezervasyonlarını serbest bırak
                const stockReleasePromises = stockChecks.map(async ({ stock, item, reservation }) => {
                    await Stock.updateOne(
                        { _id: stock._id },
                        {
                            $pull: { reservations: { _id: item.stockReservationId } },
                            $inc: { quantity: item.quantity }
                        }
                    );
                });

                await Promise.all(stockReleasePromises);

                PaymentLogger.error('PAYMENT_FAILED', 'Ödeme başarısız', {
                    paymentId: payment._id,
                    orderId: order._id,
                    error: result
                });

                return {
                    success: false,
                    error: {
                        code: result.responseCode,
                        message: result.responseMessage
                    }
                };
            }
        } catch (error) {
            PaymentLogger.error('COMPLETE_PAYMENT_ERROR', error, {
                paymentId: payment._id,
                orderId: order._id,
                stack: error.stack
            });

            // Hata durumunda payment ve order güncelle
            payment.status = 'FAILED';
            payment.error = {
                code: 'SYSTEM_ERROR',
                message: error.message
            };
            await payment.save();

            order.status = 'FAILED';
            order.paymentDetails = {
                status: 'FAILED',
                errorCode: 'SYSTEM_ERROR',
                errorMessage: error.message
            };
            await order.save();

            throw error;
        }
    },

    // Ödeme durumu sorgulama
    async getPaymentStatus(req, res) {
        try {
            const { paymentId } = req.params;

            // Cache kontrolü
            const cacheKey = `payment_${paymentId}`;
            const cachedPayment = paymentCache.get(cacheKey);

            if (cachedPayment) {
                return res.json({
                    success: true,
                    data: cachedPayment
                });
            }

            const payment = await Payment.findById(paymentId)
                .select('-cardDetails.cvv')
                .populate('orderId', 'status totalAmount');

            if (!payment) {
                logPaymentDetails('PAYMENT_NOT_FOUND', { paymentId });
                PaymentLogger.error('PAYMENT_NOT_FOUND', { message: 'Ödeme kaydı bulunamadı' });
                return res.status(404).json({
                    success: false,
                    message: 'Ödeme kaydı bulunamadı'
                });
            }

            // Cache'e ekle
            paymentCache.set(cacheKey, payment);

            res.json({
                success: true,
                data: payment
            });
        } catch (error) {
            logPaymentDetails('PAYMENT_STATUS_ERROR', req.params, error);
            PaymentLogger.error('PAYMENT_STATUS_ERROR', error, {
                message: error.message,
                stack: error.stack
            });
            res.status(400).json({
                success: false,
                error: error.message
            });
        }
    },

    // İptal/İade işlemi
    async refundPayment(req, res) {
        try {
            const { paymentId } = req.params;
            const { reason } = req.body;

            const payment = await Payment.findById(paymentId);
            if (!payment) {
                logPaymentDetails('PAYMENT_NOT_FOUND', { paymentId });
                PaymentLogger.error('PAYMENT_NOT_FOUND', { message: 'Ödeme kaydı bulunamadı' });
                return res.status(404).json({
                    success: false,
                    message: 'Ödeme kaydı bulunamadı'
                });
            }

            if (!payment.canBeRefunded()) {
                logPaymentDetails('REFUND_NOT_ALLOWED', { paymentId });
                PaymentLogger.error('REFUND_NOT_ALLOWED', { message: 'Bu ödeme iade edilemez durumda' });
                return res.status(400).json({
                    success: false,
                    message: 'Bu ödeme iade edilemez durumda'
                });
            }

            // İade isteği hazırla ve gönder
            // Kuveyt Türk iade API'si entegre edilecek

            payment.status = 'REFUNDED';
            await payment.addStatusHistory('REFUNDED', reason);
            logPaymentDetails('PAYMENT_REFUNDED', {
                paymentId: payment._id,
                orderId: payment.orderId
            });
            PaymentLogger.info('PAYMENT_REFUNDED', 'Ödeme kaydı güncellendi', {
                paymentId: payment._id,
                orderId: payment.orderId
            });

            // Siparişi güncelle
            const order = await Order.findById(payment.orderId);
            if (order) {
                order.status = 'REFUNDED';
                order.paymentDetails = {
                    status: 'REFUNDED',
                    errorCode: 'REFUNDED',
                    errorMessage: reason
                };
                await order.save();
                PaymentLogger.info('ORDER_UPDATED', 'Sipariş güncellendi', {
                    status: order.status,
                    paymentStatus: order.paymentDetails.status
                });
            }

            // WebSocket bildirimi
            const io = req.app.get('io');
            PaymentLogger.debug('WEBSOCKET_EMIT', 'WebSocket bildirimi gönderiliyor...');
            io.emit('paymentRefunded', { orderId: payment.orderId });
            PaymentLogger.debug('WEBSOCKET_EMIT', 'WebSocket bildirimi gönderildi');

            res.json({
                success: true,
                data: payment
            });
        } catch (error) {
            logPaymentDetails('REFUND_ERROR', req.params, error);
            PaymentLogger.error('REFUND_ERROR', error, {
                message: error.message,
                stack: error.stack
            });
            res.status(400).json({
                success: false,
                error: error.message
            });
        }
    },

    // KT entegrasyonu için ödeme başlatma
    async initiateKTLPayment(req, res) {
        try {
            const { orderId } = req.params;
            const clientIp = req.ip;

            // Request body log
            PaymentLogger.debug('PAYMENT_REQUEST', {
                stage: 'REQUEST_RECEIVED',
                orderId,
                body: req.body,
                clientIp
            });

            // Order kontrolü
            const order = await Order.findById(orderId);
            if (!order) {
                PaymentLogger.error('ORDER_NOT_FOUND', {
                    stage: 'ORDER_CHECK',
                    orderId,
                    message: 'Sipariş bulunamadı'
                });
                throw new Error('Sipariş bulunamadı');
            }

            // Amount kontrolü
            if (!req.body.Amount) {
                PaymentLogger.error('AMOUNT_MISSING', {
                    stage: 'AMOUNT_CHECK',
                    orderId,
                    body: req.body,
                    message: 'Ödeme tutarı eksik'
                });
                throw new Error('Ödeme tutarı eksik');
            }

            // Ödeme başlatma log
            PaymentLogger.payment.Start(orderId, req.body.Amount, {
                cardType: req.body.CardType,
                installment: req.body.InstallmentCount
            });

            // Payment verisi hazırla
            const paymentData = {
                cardNumber: req.body.CardNumber,
                cardHolderName: req.body.CardHolderName,
                expiryMonth: req.body.CardExpireDateMonth,
                expiryYear: req.body.CardExpireDateYear,
                cvv: req.body.CardCVV2,
                amount: req.body.Amount,
                installment: req.body.InstallmentCount || '0',
                cardType: req.body.CardType,
                cardHolderData: req.body.CardHolderData,
                deviceData: req.body.DeviceData || {}
            };

            // XML oluştur
            PaymentLogger.debug('XML_CREATION_START', {
                stage: 'XML_CREATION',
                orderId,
                paymentData: req.body
            });

            const xmlRequest = createKTXmlRequestWithCardHolder(req.body, clientIp);

            PaymentLogger.debug('XML_CREATED', {
                stage: 'XML_CREATION',
                orderId,
                xmlRequest
            });

            // KT'ye istek at
            PaymentLogger.debug('KT_REQUEST_START', {
                stage: 'KT_REQUEST',
                orderId,
                url: KuveytTurkConfig.helpers.getThreeDPayGateUrl()
            });

            const ktResponse = await axios.post(
                KuveytTurkConfig.helpers.getThreeDPayGateUrl(),
                xmlRequest,
                {
                    headers: {
                        'Content-Type': 'application/xml',
                        'Accept': 'application/xml'
                    }
                }
            );

            PaymentLogger.debug('KT_RESPONSE_RECEIVED', {
                stage: 'KT_RESPONSE',
                orderId,
                response: ktResponse.data
            });

            // Yanıtı işle
            if (ktResponse.data) {
                const parsedResponse = await parseKTResponse(ktResponse.data);

                PaymentLogger.debug('RESPONSE_PARSED', {
                    stage: 'RESPONSE_PARSING',
                    orderId,
                    parsedResponse
                });

                // Payment kaydı oluştur
                const payment = new Payment({
                    orderId: order._id,
                    Amount: req.body.Amount,
                    CurrencyCode: req.body.CurrencyCode || '0949',
                    status: 'PENDING',
                    provider: 'KUVEYTTURK',
                    providerTransactionId: parsedResponse.orderId,
                    CardNumber: req.body.CardNumber,
                    CardHolderName: req.body.CardHolderName,
                    CardExpireDateMonth: req.body.CardExpireDateMonth,
                    CardExpireDateYear: req.body.CardExpireDateYear,
                    CardType: req.body.CardType,
                    TransactionType: req.body.TransactionType || 'Sale',
                    TransactionSecurity: req.body.TransactionSecurity || '3',
                    InstallmentCount: req.body.InstallmentCount || 0,
                    CardHolderData: req.body.CardHolderData,
                    raw: {
                        request: xmlRequest,
                        response: ktResponse.data
                    }
                });

                await payment.save();

                PaymentLogger.info('PAYMENT_CREATED', {
                    stage: 'PAYMENT_CREATION',
                    paymentId: payment._id,
                    orderId: order._id,
                    Amount: payment.Amount
                });

                return res.json({
                    success: true,
                    transactionId: payment._id,
                    redirectUrl: parsedResponse.authenticationUrl,
                    message: 'Ödeme başlatıldı'
                });
            }

            throw new Error('Ödeme başlatılamadı');

        } catch (error) {
            PaymentLogger.error('PAYMENT_ERROR', {
                stage: 'PAYMENT_PROCESSING',
                error: {
                    message: error.message,
                    stack: error.stack
                },
                request: {
                    body: req.body,
                    params: req.params
                }
            });

            res.status(400).json({
                success: false,
                message: error.message || 'Ödeme işlemi başlatılırken bir hata oluştu'
            });
        }
    }
};

export default PaymentController;
