// utils/payment.utils.js
import crypto from 'crypto';
import xml2js from 'xml2js';
import xmlbuilder from 'xmlbuilder';
import { decode } from 'html-entities';
import fs from 'fs';
import path from 'path';
import NodeCache from 'node-cache';
import { KuveytTurkConfig } from '../config/kuveytturk.config.js';
import iconv from 'iconv-lite';
// Cache instance
export const paymentCache = new NodeCache({ stdTTL: KuveytTurkConfig.settings.cacheTTL });

// Payment Logger
export const PaymentLogger = {
    logPath: path.join(process.cwd(), 'logs', 'payment.log'),

    ensureLogDirectory() {
        const dir = path.dirname(this.logPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    },

    formatMessage(level, stage, message, data = {}) {
        return JSON.stringify({
            timestamp: new Date().toISOString(),
            level,
            stage,
            message,
            data
        }, null, 2);
    },

    writeLog(message) {
        this.ensureLogDirectory();
        fs.appendFileSync(this.logPath, message + '\n');
    },

    info(stage, message, data = {}) {
        const logMessage = this.formatMessage('INFO', stage, message, data);
        this.writeLog(logMessage);
        console.log(logMessage);
    },

    error(stage, error, data = {}) {
        const errorDetails = {
            message: error.message,
            code: error.code || 'UNKNOWN_ERROR',
            stack: error.stack,
            ...data
        };
        const logMessage = this.formatMessage('ERROR', stage, error.message, errorDetails);
        this.writeLog(logMessage);
        console.error(logMessage);
    },

    debug(stage, message, data = {}) {
        const logMessage = this.formatMessage('DEBUG', stage, message, data);
        this.writeLog(logMessage);
        console.debug(logMessage);
    },

    payment: {
        Start(orderId, Amount, data = {}) {
            PaymentLogger.info('PAYMENT_START', 'Ödeme başlatıldı', {
                orderId,
                Amount,
                ...data
            });
        },

        Success(orderId, Amount, transactionId, data = {}) {
            PaymentLogger.info('PAYMENT_SUCCESS', 'Ödeme başarılı', {
                orderId,
                Amount,
                transactionId,
                ...data
            });
        },

        Error(orderId, error, data = {}) {
            PaymentLogger.error('PAYMENT_ERROR', error, {
                orderId,
                ...data
            });
        }
    },

    threeDSecure: {
        redirect(orderId, url, data = {}) {
            PaymentLogger.info('3D_REDIRECT', '3D Secure yönlendirmesi', {
                orderId,
                url,
                ...data
            });
        },

        callback(orderId, status, data = {}) {
            PaymentLogger.info('3D_CALLBACK', '3D Secure dönüşü', {
                orderId,
                status,
                ...data
            });
        }
    }
};

// XML oluşturma fonksiyonu
export const createKTXmlRequest = (transformedData) => {
    try {
        PaymentLogger.debug('XML_GENERATION', 'XML oluşturma başladı', {
            transformedData: maskSensitiveData(transformedData)
        });

        // Ana XML yapısı
        const xml = xmlbuilder.create('KuveytTurkVPosMessage', { encoding: 'UTF-8' });

        // Temel alanları ekle
        const baseFields = [
            'APIVersion',
            'HashData',
            'MerchantId',
            'CustomerId',
            'UserName',
            'Password',
            'BatchID',
            'TransactionType',
            'InstallmentCount',
            'Amount',
            'DisplayAmount',
            'CurrencyCode',
            'MerchantOrderId',
            'TransactionSecurity',
            'OkUrl',
            'FailUrl'
        ];

        baseFields.forEach(field => {
            if (transformedData[field] !== undefined) {
                xml.ele(field, transformedData[field]).up();
            }
        });

        // Kart bilgilerini ekle
        const cardFields = [
            'CardNumber',
            'CardExpireDateYear',
            'CardExpireDateMonth',
            'CardCVV2',
            'CardHolderName',
            'CardType'
        ];

        cardFields.forEach(field => {
            if (transformedData[field]) {
                xml.ele(field, transformedData[field]).up();
            }
        });

        // Kart sahibi verilerini ekle
        if (transformedData.CardHolderData) {
            const cardHolderElement = xml.ele('CardHolderData');
            
            // Düz alanları ekle
            const directFields = [
                'BillAddrCity',
                'BillAddrCountry',
                'BillAddrLine1',
                'BillAddrPostCode',
                'BillAddrState',
                'Email'
            ];

            directFields.forEach(field => {
                if (transformedData.CardHolderData[field]) {
                    cardHolderElement.ele(field, transformedData.CardHolderData[field]);
                }
            });

            // MobilePhone alt yapısını ekle
            if (transformedData.CardHolderData.MobilePhone) {
                const phoneElement = cardHolderElement.ele('MobilePhone');
                const { Cc, Subscriber } = transformedData.CardHolderData.MobilePhone;
                if (Cc) phoneElement.ele('Cc', Cc);
                if (Subscriber) phoneElement.ele('Subscriber', Subscriber);
                phoneElement.up();
            }

            cardHolderElement.up();
        }

        // Cihaz verilerini ekle
        if (transformedData.DeviceData) {
            const deviceElement = xml.ele('DeviceData');
            Object.entries(transformedData.DeviceData).forEach(([key, value]) => {
                deviceElement.ele(key, value);
            });
            deviceElement.up();
        }

        const xmlString = xml.end({ pretty: true });

        PaymentLogger.debug('XML_GENERATION_COMPLETE', 'XML oluşturma tamamlandı', {
            xmlLength: xmlString.length
        });

        // XML'i logla (hassas veriler maskelenmiş olarak)
        PaymentLogger.debug('XML_CONTENT', 'Oluşturulan XML içeriği', {
            xml: maskSensitiveXml(xmlString)
        });

        return xmlString;
    } catch (error) {
        PaymentLogger.error('XML_GENERATION', error);
        throw new Error(`XML oluşturma hatası: ${error.message}`);
    }
};

// XML içindeki hassas verileri maskele
const maskSensitiveXml = (xmlString) => {
    return xmlString
        .replace(/<CardNumber>.*?<\/CardNumber>/g, '<CardNumber>************XXXX</CardNumber>')
        .replace(/<CardCVV2>.*?<\/CardCVV2>/g, '<CardCVV2>***</CardCVV2>')
        .replace(/<HashData>.*?<\/HashData>/g, '<HashData>***HIDDEN***</HashData>')
        .replace(/<Password>.*?<\/Password>/g, '<Password>***HIDDEN***</Password>')
        .replace(/<Subscriber>.*?<\/Subscriber>/g, '<Subscriber>*****XXXX</Subscriber>');
};

// Hash hesaplama fonksiyonu - RES2 (Provision) için
export const calculateHash = ({ merchantId: MerchantId, merchantOrderId: MerchantOrderId, amount: Amount, username: UserName, hashPassword: HashPassword }) => {
    try {
        // Debug log: Gelen parametreler
        PaymentLogger.debug('HASH_CALCULATION', 'Başlangıç parametreleri', {
            merchantId: MerchantId,
            merchantOrderId: MerchantOrderId,
            amount: Amount,
            username: UserName
        });

        // Hash password hesaplama
        const hashedPassword = crypto.createHash('sha1')
            .update(iconv.encode(HashPassword, 'ISO-8859-9'))
            .digest('base64');

        // Debug log: Hashed password
        PaymentLogger.debug('HASH_CALCULATION', 'Hashed Password oluşturuldu', {
            hashedPassword: hashedPassword
        });

        // Hash stringi oluşturma (RES2 formatı: MerchantId + MerchantOrderId + Amount + UserName + HashedPassword)
        const hashString = `${MerchantId}${MerchantOrderId}${Amount}${UserName}${hashedPassword}`;

        // Debug log: Hash string
        PaymentLogger.debug('HASH_CALCULATION', 'Hash string oluşturuldu', {
            hashString: hashString
        });

        // Hash hesaplama ve Base64 dönüşümü
        const hashBuffer = crypto.createHash('sha1')
            .update(iconv.encode(hashString, 'ISO-8859-9'))
            .digest();
        
        const finalHash = Buffer.from(hashBuffer).toString('base64');

        // Debug log: Final hash
        PaymentLogger.debug('HASH_CALCULATION', 'Final hash oluşturuldu', {
            finalHash: finalHash
        });

        return finalHash;
    } catch (error) {
        // Error log
        PaymentLogger.error('HASH_CALCULATION', error, {
            stage: 'Hash hesaplama hatası',
            parameters: {
                merchantId: MerchantId,
                merchantOrderId: MerchantOrderId,
                amount: Amount,
                username: UserName
            }
        });
        console.error('Hash hesaplama hatası:', error);
        throw new Error('Hash hesaplama başarısız oldu.');
    }
};

// Hash hesaplama fonksiyonları
export const HashUtils = {
    // API şifresini hash'leme
    hashPassword(password) {
        try {
            const sha1Hash = crypto.createHash('sha1')
                .update(iconv.encode(password, 'ISO-8859-9'))
                .digest();
            const hashedPassword = sha1Hash.toString('base64');

            PaymentLogger.debug('HASH_PASSWORD', 'Hash password hesaplandı', {
                inputLength: password.length,
                outputLength: hashedPassword.length,
                hashedValue: hashedPassword
            });

            return hashedPassword;
        } catch (error) {
            PaymentLogger.error('HASH_PASSWORD_ERROR', error);
            throw error;
        }
    },

    // Kuveyt Türk için HashData oluşturma
    createKTHashData({ merchantId, merchantOrderId, amount, okUrl, failUrl, username, hashedPassword }) {
        try {
            // Hash için string oluştur
            const hashString = `${merchantId}${merchantOrderId}${amount}${okUrl}${failUrl}${username}${hashedPassword}`;
            
            // Hash hesapla
            const sha1Hash = crypto.createHash('sha1')
                .update(iconv.encode(hashString, 'ISO-8859-9'))
                .digest();
            const hashData = sha1Hash.toString('base64');

            PaymentLogger.debug('HASH_DATA', 'Hash data hesaplandı', {
                inputParams: { merchantId, merchantOrderId, amount, username },
                hashLength: hashData.length,
                hashValue: hashData
            });

            return hashData;
        } catch (error) {
            PaymentLogger.error('HASH_DATA_ERROR', error);
            throw error;
        }
    },

    // Kuveyt Türk için HashData oluşturma (REQ2 - Provision için)
    createKTProvisionHash({ merchantId, merchantOrderId, amount, username, password }) {
        try {
            // Debug log: Gelen parametreler
            PaymentLogger.debug('PROVISION_HASH_CALCULATION', 'Provision hash hesaplama başladı', {
                merchantId,
                merchantOrderId,
                amount,
                username
            });

            // İlk önce password'ü hashle
            const hashedPassword = this.hashPassword(password);
            
            // Debug log: Hashed password
            PaymentLogger.debug('PROVISION_HASH_CALCULATION', 'Password hash\'lendi', {
                hashedPassword
            });

            // Hash string'i oluştur (REQ2 formatı: MerchantId + MerchantOrderId + Amount + UserName + HashedPassword)
            const hashString = `${merchantId}${merchantOrderId}${amount}${username}${hashedPassword}`;

            // Debug log: Hash string
            PaymentLogger.debug('PROVISION_HASH_CALCULATION', 'Hash string oluşturuldu', {
                hashString
            });

            // Final hash hesaplama
            const finalHash = crypto
                .createHash('sha1')
                .update(iconv.encode(hashString, 'ISO-8859-9'))
                .digest('base64');

            // Debug log: Final hash
            PaymentLogger.debug('PROVISION_HASH_CALCULATION', 'Final hash oluşturuldu', {
                finalHash
            });

            return finalHash;
        } catch (error) {
            PaymentLogger.error('PROVISION_HASH_CALCULATION', error, {
                stage: 'Hash hesaplama hatası',
                parameters: {
                    merchantId,
                    merchantOrderId,
                    amount,
                    username
                }
            });
            throw new Error('Provision hash hesaplama başarısız oldu');
        }
    }
};

// Amount formatı düzeltme fonksiyonu
export const formatAmount = (amount) => {
    try {
        if (typeof amount === 'string') {
            amount = parseFloat(amount);
        }
        if (isNaN(amount)) {
            throw new Error('Geçersiz tutar formatı');
        }
        return Math.round(amount * 100).toString();
    } catch (error) {
        PaymentLogger.error('AMOUNT_FORMAT', error);
        throw new Error('Tutar format hatası: ' + error.message);
    }
};

// Response parsing fonksiyonları
const parse3DSecureForm = (htmlResponse) => {
    try {
        PaymentLogger.debug('3D_FORM_PARSE_START', '3D Secure form verisi ayrıştırılıyor');
        
        // Form verilerini çıkar
        const formStartIndex = htmlResponse.indexOf('<form');
        const formEndIndex = htmlResponse.indexOf('</form>');
        const formContent = htmlResponse.slice(formStartIndex, formEndIndex + 7);
        
        // Action URL'ini çıkar
        const actionMatch = formContent.match(/action=['"]([^'"]+)['"]/);
        const actionUrl = actionMatch ? actionMatch[1] : '';
        
        // Hidden input'ları çıkar
        const hiddenInputs = {};
        const inputMatches = formContent.match(/<input[^>]*>/g) || [];
        
        inputMatches.forEach(input => {
            const nameMatch = input.match(/name=['"]([^'"]+)['"]/);
            const valueMatch = input.match(/value=['"]([^'"]+)['"]/);
            if (nameMatch && valueMatch) {
                hiddenInputs[nameMatch[1]] = valueMatch[1];
            }
        });

        PaymentLogger.debug('3D_FORM_PARSE_SUCCESS', '3D Secure form verisi başarıyla ayrıştırıldı', {
            actionUrl,
            inputCount: Object.keys(hiddenInputs).length
        });

        return {
            is3DSecure: true,
            formData: {
                action: actionUrl,
                method: 'POST',
                inputs: hiddenInputs
            }
        };
    } catch (error) {
        PaymentLogger.error('3D_FORM_PARSE_ERROR', error);
        throw new Error('3D Secure form verisi ayrıştırılamadı: ' + error.message);
    }
};

// Response parsing fonksiyonu
export const parseKTResponse = async (response) => {
    try {
        // Ham yanıtı logla
        PaymentLogger.debug('KT_RAW_RESPONSE', 'Ham KT yanıtı', {
            responseData: response
        });

        // HTML yanıtı kontrolü
        if (response.includes('<!DOCTYPE html') || response.includes('<html')) {
            PaymentLogger.debug('RESPONSE_TYPE_CHECK', '3D Secure HTML form yanıtı tespit edildi');
            const formData = parse3DSecureForm(response);
            return {
                isEnrolled: true,
                isVirtual: false,
                is3DSecure: true,
                success: true,  // HTML form geldiğinde ilk aşama başarılı
                processingStage: '3D_AUTH',
                formData: formData
            };
        }

        // XML yanıtı için mevcut işlem
        const result = await xml2js.parseStringPromise(response, {
            explicitArray: false,
            ignoreAttrs: true
        });

        // VPosMessage içeriğini al
        const vPosMessage = result.VPosTransactionResponseContract?.VPosMessage;
        
        // Temel yanıt bilgilerini kontrol et
        const responseData = {
            isEnrolled: String(result.VPosTransactionResponseContract?.IsEnrolled).toLowerCase() === 'true',
            isVirtual: String(result.VPosTransactionResponseContract?.IsVirtual).toLowerCase() === 'true',
            responseCode: result.VPosTransactionResponseContract?.ResponseCode,
            responseMessage: result.VPosTransactionResponseContract?.ResponseMessage,
            orderId: result.VPosTransactionResponseContract?.OrderId,
            merchantOrderId: result.VPosTransactionResponseContract?.MerchantOrderId,
            hashData: result.VPosTransactionResponseContract?.HashData,
            merchantData: result.VPosTransactionResponseContract?.MD,
            referenceId: result.VPosTransactionResponseContract?.ReferenceId,
            businessKey: result.VPosTransactionResponseContract?.BusinessKey,
            transactionTime: result.VPosTransactionResponseContract?.TransactionTime
        };

        // VPosMessage detaylarını ekle
        if (vPosMessage) {
            responseData.vPosDetails = {
                orderId: vPosMessage.OrderId,
                merchantId: vPosMessage.MerchantId,
                customerId: vPosMessage.CustomerId,
                userName: vPosMessage.UserName,
                cardNumber: vPosMessage.CardNumber,
                batchId: vPosMessage.BatchID,
                installmentCount: vPosMessage.InstallmentCount,
                amount: vPosMessage.Amount,
                currencyCode: vPosMessage.CurrencyCode,
                transactionSecurity: vPosMessage.TransactionSecurity
            };
        }

        // İşlem aşamasını belirle
        responseData.processingStage = responseData.isEnrolled ? '3D_AUTH' : 'COMPLETE';

        // Başarı durumunu kontrol et
        // ResponseCode 00 ise ve 3D işlemi gerekiyorsa veya 3D gerekmiyorsa başarılı
        responseData.success = (
            responseData.responseCode === '00' && 
            (responseData.isEnrolled ? responseData.processingStage === '3D_AUTH' : true)
        );

        PaymentLogger.debug('PARSED_RESPONSE', 'Ayrıştırılan KT yanıtı', {
            parsedData: responseData
        });

        return responseData;

    } catch (error) {
        PaymentLogger.error('RESPONSE_PARSING', error);
        throw new Error(`Yanıt parse hatası: ${error.message}`);
    }
};

// Kart sahibi verilerini formatlama
export const formatCardHolderData = (cardHolderData) => {
    try {
        // İç içe CardHolderData yapısını düzelt
        const data = cardHolderData?.CardHolderData || cardHolderData || {};

        return {
            BillAddrCity: data.BillAddrCity?.trim() || '',
            BillAddrCountry: data.BillAddrCountry?.trim() || '',
            BillAddrLine1: data.BillAddrLine1?.trim() || '',
            BillAddrPostCode: data.BillAddrPostCode?.trim() || '',
            BillAddrState: data.BillAddrState?.trim() || '',
            Email: data.Email?.trim() || '',
            MobilePhone: {
                Cc: data.MobilePhone?.Cc?.trim() || '',
                Subscriber: data.MobilePhone?.Subscriber?.trim() || ''
            }
        };
    } catch (error) {
        PaymentLogger.error('FORMAT_CARDHOLDER_DATA_ERROR', error);
        throw new Error(`Kart sahibi verileri formatlanırken hata: ${error.message}`);
    }
};

// Cihaz verilerini hazırlama
export const prepareDeviceData = (clientIp) => {
    return {
        clientIp,
        deviceType: 'WEB',
        timestamp: new Date().toISOString()
    };
};

// Hassas verileri maskeleme
export const maskSensitiveData = (data) => {
    if (typeof data === 'string') {
        // XML veya string veriler için
        return data
            .replace(/<CardNumber>.*?<\/CardNumber>/g, '<CardNumber>************</CardNumber>')
            .replace(/<CardCVV2>.*?<\/CardCVV2>/g, '<CardCVV2>***</CardCVV2>')
            .replace(/<Password>.*?<\/Password>/g, '<Password>********</Password>')
            .replace(/<HashPassword>.*?<\/HashPassword>/g, '<HashPassword>********</HashPassword>');
    }

    if (!data || typeof data !== 'object') {
        return data;
    }

    const maskedData = Array.isArray(data) ? [] : {};

    for (const [key, value] of Object.entries(data)) {
        if (typeof value === 'object' && value !== null) {
            maskedData[key] = maskSensitiveData(value);
        } else if (
            ['CardNumber', 'CardCVV2', 'Password', 'HashPassword'].includes(key) &&
            typeof value === 'string'
        ) {
            maskedData[key] = key === 'CardCVV2' ? '***' : '************';
        } else {
            maskedData[key] = value;
        }
    }

    return maskedData;
};

// Ödeme detaylarını loglama
export const logPaymentDetails = (stage, data, error = null) => {
    const maskedData = maskSensitiveData(data);
    if (error) {
        PaymentLogger.error(stage, error, maskedData);
    } else {
        PaymentLogger.info(stage, 'Ödeme işlemi', maskedData);
    }
};

// İstek detaylarını loglama
export const logRequestDetails = (req, stage) => {
    const requestData = {
        method: req.method,
        path: req.path,
        query: req.query,
        headers: {
            ...req.headers,
            authorization: req.headers.authorization ? '***HIDDEN***' : undefined
        },
        ip: req.ip
    };
    PaymentLogger.debug(stage, 'İstek detayları', requestData);
};

// WebSocket event'lerini emit eden fonksiyon
export const emitPaymentEvent = (io, eventName, paymentId, data) => {
    io.emit(`payment:${eventName}`, { paymentId, ...data });
};

// Frontend'den gelen veriyi KT formatına dönüştürme
export const transformPaymentDataToKTFormat = (paymentData, clientIp) => {
    try {
        PaymentLogger.debug('TRANSFORM_START', 'Veri dönüşümü başladı', {
            maskedData: maskSensitiveData(paymentData)
        });

        // API kimlik bilgilerini al
        const { merchantId, customerId, username, password, hashPassword } = KuveytTurkConfig.auth;
        const { success: okUrl, fail: failUrl } = KuveytTurkConfig.callbacks;

        // Şifreyi hash'le
        const hashedPassword = HashUtils.hashPassword(password);

        // HashData oluştur
        const hashData = HashUtils.createKTHashData({
            merchantId,
            merchantOrderId: paymentData.MerchantOrderId,
            amount: formatAmount(paymentData.Amount), 
            okUrl,
            failUrl,
            username,
            hashedPassword
        });

        // Dönüştürülmüş veriyi oluştur
        const transformedData = {
            APIVersion: 'TDV2.0.0',
            HashData: hashData,
            MerchantId: merchantId,
            CustomerId: customerId,
            UserName: username,
            Password: password,
            BatchID: '0',
            OkUrl: okUrl,
            FailUrl: failUrl,
            ...paymentData,
            Amount: formatAmount(paymentData.Amount),                
            CardHolderData: formatCardHolderData(paymentData.CardHolderData),
            DeviceData: prepareDeviceData(clientIp)
        };

        PaymentLogger.debug('TRANSFORM_COMPLETE', 'Veri dönüşümü tamamlandı', {
            maskedData: maskSensitiveData(transformedData)
        });

        return transformedData;
    } catch (error) {
        PaymentLogger.error('TRANSFORM_ERROR', error);
        throw error;
    }
};

// Dönüştürülen verinin validasyonu
export const validateTransformedData = (data) => {
    try {
        PaymentLogger.debug('PAYMENT_VALIDATION', 'Veri doğrulama başladı');

        const requiredFields = [
            'CardNumber',
            'CardHolderName',
            'CardExpireDateYear',
            'CardExpireDateMonth',
            'CardCVV2',
            'CardType',
            'Amount'
        ];

        const missingFields = requiredFields.filter(field => !data[field]);
        if (missingFields.length > 0) {
            throw new Error(`Eksik zorunlu alanlar: ${missingFields.join(', ')}`);
        }

        // CardHolderData validasyonu
        const requiredCardHolderFields = [
            'BillAddrCity',
            'BillAddrCountry',
            'BillAddrLine1',
            'BillAddrPostCode',
            'BillAddrState',
            'Email'
        ];

        const missingCardHolderFields = requiredCardHolderFields.filter(
            field => !data.CardHolderData[field]
        );

        if (missingCardHolderFields.length > 0) {
            throw new Error(`Eksik CardHolderData alanları: ${missingCardHolderFields.join(', ')}`);
        }

        // MobilePhone validasyonu
        if (!data.CardHolderData.MobilePhone?.Cc || !data.CardHolderData.MobilePhone?.Subscriber) {
            throw new Error('Eksik telefon bilgileri');
        }

        PaymentLogger.debug('PAYMENT_VALIDATION', 'Veri doğrulama başarılı');
        return true;
    } catch (error) {
        PaymentLogger.error('PAYMENT_VALIDATION', error);
        throw error;
    }
};

// İkinci adım ödeme isteği için XML oluşturma fonksiyonu
export const createKTPaymentRequest = (paymentData) => {
    try {
        PaymentLogger.debug('XML_REQUEST_DATA', 'XML oluşturma öncesi veriler', {
            merchantId: paymentData.MerchantId,
            customerId: paymentData.CustomerId,
            amount: paymentData.Amount,
            merchantOrderId: paymentData.MerchantOrderId,
            md: paymentData.KuveytTurkVPosAdditionalData?.AdditionalData?.Data
        });
        
        
        PaymentLogger.debug('MD_VALUE_CHECK', 'MD değeri detayları', {
            rawMD: paymentData.KuveytTurkVPosAdditionalData?.AdditionalData?.Data,
            mdType: typeof paymentData.KuveytTurkVPosAdditionalData?.AdditionalData?.Data,
            mdLength: paymentData.KuveytTurkVPosAdditionalData?.AdditionalData?.Data?.length,
            mdBuffer: Buffer.from(paymentData.KuveytTurkVPosAdditionalData?.AdditionalData?.Data || '', 'base64').toString('utf8')
        });
        PaymentLogger.debug('PAYMENT_XML_START', 'Ödeme XML oluşturma başladı', {
            paymentData: maskSensitiveData(paymentData)
        });

        // Ana XML yapısı
        const xml = xmlbuilder.create('KuveytTurkVPosMessage', {
            encoding: 'ISO-8859-9'
        })
        .att('xmlns:xsi', 'http://www.w3.org/2001/XMLSchema-instance')
        .att('xmlns:xsd', 'http://www.w3.org/2001/XMLSchema');

        // Sıralı olarak zorunlu alanları ekle
        xml.ele('APIVersion').txt('TDV2.0.0').up()
           .ele('HashData').txt(paymentData.HashData).up()
           .ele('MerchantId').txt(paymentData.MerchantId).up()
           .ele('CustomerId').txt(paymentData.CustomerId).up()
           .ele('UserName').txt(paymentData.UserName).up()
           .ele('TransactionType').txt('Sale').up()
           .ele('InstallmentCount').txt(paymentData.InstallmentCount || '0').up()
           .ele('Amount').txt(paymentData.Amount).up()
           .ele('MerchantOrderId').txt(paymentData.MerchantOrderId).up()
           .ele('TransactionSecurity').txt('3').up();

        // MD değerini ekle
        const additionalDataElement = xml.ele('KuveytTurkVPosAdditionalData')
        .ele('AdditionalData');
        
        additionalDataElement
        .ele('Key').txt('MD').up()
        .ele('Data').txt(paymentData.KuveytTurkVPosAdditionalData.AdditionalData.Data);            
        const xmlString = xml.end({ pretty: false });

        PaymentLogger.debug('XML_REQUEST_STRING', 'Oluşturulan XML', {
            xmlString: xmlString
        });

        // Detaylı XML içerik loglaması
        PaymentLogger.debug('PAYMENT_XML_RAW_CONTENT', 'Ham XML içeriği ve veri tipleri', {
            rawXml: xmlString,
            dataTypes: {
                TransactionSecurity: typeof paymentData.TransactionSecurity,
                Amount: typeof paymentData.Amount,
                InstallmentCount: typeof paymentData.InstallmentCount
            },
            values: {
                TransactionSecurity: paymentData.TransactionSecurity,
                Amount: paymentData.Amount,
                InstallmentCount: paymentData.InstallmentCount
            }
        });

        PaymentLogger.debug('PAYMENT_XML_COMPLETE', 'Ödeme XML oluşturma tamamlandı', {
            xmlLength: xmlString.length,
            xml: maskSensitiveXml(xmlString)
        });

        return xmlString;
    } catch (error) {
        PaymentLogger.error('PAYMENT_XML_ERROR', error);
        throw new Error(`Ödeme XML oluşturma hatası: ${error.message}`);
    }
};

// 3D Secure Authentication Response işleme fonksiyonları
export const ThreeDSecureUtils = {
    // AuthenticationResponse decode ve parse
    async decodeAndParseAuthResponse(authResponse) {
        try {
            // İlk log kaydı
            PaymentLogger.debug('3D_XML_PARSE_START', 'XML parse başlangıcı', {
                responseLength: authResponse?.length,
                isString: typeof authResponse === 'string',
                firstChars: authResponse?.substring(0, 50)
            });

            // Önce + karakterlerini boşluk ile değiştir
            const spacesFixed = authResponse.replace(/\+/g, ' ');
            
            // Sonra URL decode işlemi
            const urlDecoded = decodeURIComponent(spacesFixed);
            
            // HTML entities decode
            const htmlDecoded = decode(urlDecoded);
            
            // Decode sonrası log
            PaymentLogger.debug('3D_XML_DECODED', 'XML decode sonrası', {
                decodedLength: htmlDecoded?.length,
                containsXML: htmlDecoded?.includes('<?xml'),
                firstChars: htmlDecoded?.substring(0, 50),
                hasInvalidChars: /[^\x09\x0A\x0D\x20-\uD7FF\uE000-\uFFFD\u10000-\u10FFFF]/.test(htmlDecoded)
            });

            // XML parse işlemi
            const parser = new xml2js.Parser({
                explicitArray: false,
                ignoreAttrs: true,
                trim: true
            });

            const result = await parser.parseStringPromise(htmlDecoded);

            // Parse sonrası log
            PaymentLogger.debug('3D_XML_PARSED', 'XML parse sonucu', {
                hasResult: !!result,
                topLevelKeys: Object.keys(result || {}),
                hasVPosResponse: !!result?.VPosTransactionResponseContract
            });

            return result;
        } catch (error) {
            // Hata durumunda detaylı log
            PaymentLogger.error('3D_XML_PARSE_ERROR', 'XML parse hatası', {
                errorMessage: error.message,
                errorName: error.name,
                phase: 'XML_PARSE',
                rawResponse: authResponse?.substring(0, 100),
                decodedSample: htmlDecoded?.substring(0, 100)
            });
            throw error;
        }
    },

    // Parse edilmiş yanıttan gerekli alanları çıkar
    extract3DSecureData(parsedResponse) {
        try {
            PaymentLogger.debug('3D_DATA_EXTRACT_START', 'Veri çıkarma başladı', {
                responseKeys: Object.keys(parsedResponse || {}),
                hasVPosContract: !!parsedResponse?.VPosTransactionResponseContract
            });

            // Response tipini belirle ve uygun şekilde işle
            let response;
            if (parsedResponse.VPosTransactionResponseContract) {
                // Response 2 formatı
                response = parsedResponse.VPosTransactionResponseContract;
            } else if (parsedResponse.VPosMessage) {
                // Response 1 formatı
                response = parsedResponse;
            } else {
                throw new Error('Geçersiz response formatı');
            }
            
            // Temel alanları çıkar
            const extractedData = {
                orderId: response.OrderId,
                merchantOrderId: response.MerchantOrderId,
                responseCode: response.ResponseCode,
                responseMessage: response.ResponseMessage,
                md: response.MD,
                referenceId: response.ReferenceId,
                businessKey: response.BusinessKey,
                hashData: response.HashData,
                // Response 2'ye özel alanlar
                provisionNumber: response.ProvisionNumber,
                rrn: response.RRN,
                stan: response.Stan,
                transactionTime: response.TransactionTime
            };

            // Eksik zorunlu alanları kontrol et
            const requiredFields = ['responseCode', 'responseMessage', 'merchantOrderId'];
            const missingFields = requiredFields.filter(field => !extractedData[field]);

            if (missingFields.length > 0) {
                throw new Error(`Zorunlu alanlar eksik: ${missingFields.join(', ')}`);
            }

            PaymentLogger.debug('3D_DATA_EXTRACTED', 'Çıkarılan veriler', {
                extractedFields: Object.keys(extractedData),
                responseCode: extractedData.responseCode,
                hasOrderId: !!extractedData.orderId,
                hasMD: !!extractedData.md
            });

            return extractedData;
        } catch (error) {
            PaymentLogger.error('3D_DATA_EXTRACT_ERROR', error, {
                errorType: error.name,
                errorMessage: error.message,
                availableData: Object.keys(parsedResponse || {})
            });
            throw error;
        }
    },

    // 3D Secure yanıt validasyonu
    validate3DSecureResponse(extractedData) {
        try {
            PaymentLogger.debug('3D_VALIDATE_START', 'Validasyon başladı', {
                responseCode: extractedData.responseCode,
                hasHash: !!extractedData.hashData
            });

            // Response code kontrolü
            if (extractedData.responseCode !== '00') {
                throw new Error(`Geçersiz response code: ${extractedData.responseCode} - ${extractedData.responseMessage}`);
            }

            // Hash doğrulama
            const calculatedHash = this.calculateResponseHash(extractedData);
            
            if (calculatedHash !== extractedData.hashData) {
                PaymentLogger.error('3D_HASH_MISMATCH', 'Hash uyuşmazlığı', {
                    expected: extractedData.hashData,
                    calculated: calculatedHash
                });
                throw new Error('Hash doğrulaması başarısız');
            }

            PaymentLogger.debug('3D_VALIDATE_SUCCESS', 'Validasyon başarılı', {
                responseCode: extractedData.responseCode,
                hashValid: true
            });

            return true;
        } catch (error) {
            PaymentLogger.error('3D_VALIDATE_ERROR', error, {
                errorType: error.name,
                errorMessage: error.message
            });
            throw error;
        }
    },

    // Response hash hesaplama
    calculateResponseHash(data) {
        try {
            // Decoded XML verisini logla
            PaymentLogger.debug('3D_HASH_DEBUG_XML', 'Decoded XML içeriği', {
                fullXmlData: data,
                xmlKeys: Object.keys(data)
            });

            // Response 1 için gerekli parametreleri al ve normalize et
            const merchantOrderId = (data.merchantOrderId || '').trim();
            const responseCode = (data.responseCode || '').trim();
            const orderId = (data.orderId || '').trim();
            
            // API şifresini al ve hash'le
            const apiPassword = KuveytTurkConfig.auth.password;
            if (!apiPassword) {
                throw new Error('API password is not configured');
            }

            // API şifresini SHA1 ile hashle ve Base64'e çevir (binary encoding kullanarak)
            const hashedPassword = crypto.createHash('sha1')
                .update(iconv.encode(apiPassword, 'ISO-8859-9'))
                .digest('base64');

            // Hash öncesi değerleri detaylı logla
            PaymentLogger.debug('3D_HASH_DEBUG_VALUES', 'Hash hesaplamada kullanılan değerler', {
                merchantOrderId: {
                    value: merchantOrderId,
                    length: merchantOrderId.length,
                    type: typeof merchantOrderId
                },
                responseCode: {
                    value: responseCode,
                    length: responseCode.length,
                    type: typeof responseCode
                },
                orderId: {
                    value: orderId,
                    length: orderId.length,
                    type: typeof orderId
                },
                apiPassword: {
                    value: '[MASKED]',
                    length: apiPassword.length,
                    type: typeof apiPassword
                },
                hashedPassword: {
                    value: hashedPassword,
                    length: hashedPassword.length,
                    type: typeof hashedPassword
                }
            });

            // Hash string'ini oluştur (hashedPassword ile)
            const hashString = `${merchantOrderId}${responseCode}${orderId}${hashedPassword}`;

            // Hash string detaylarını logla
            PaymentLogger.debug('3D_HASH_DEBUG_STRING', 'Oluşturulan hash string detayları', {
                hashString,
                hashStringLength: hashString.length,
                hashStringParts: {
                    part1: { value: merchantOrderId, start: 0, end: merchantOrderId.length },
                    part2: { value: responseCode, start: merchantOrderId.length, end: merchantOrderId.length + responseCode.length },
                    part3: { value: orderId, start: merchantOrderId.length + responseCode.length, end: merchantOrderId.length + responseCode.length + orderId.length },
                    part4: { value: '[MASKED]', start: merchantOrderId.length + responseCode.length + orderId.length }
                }
            });

            // Hash hesapla (binary encoding kullanarak)
            const responseHash = crypto.createHash('sha1')
                .update(iconv.encode(hashString, 'ISO-8859-9'))
                .digest('base64');

            PaymentLogger.debug('3D_HASH_RESULT', 'Hesaplanan hash', {
                merchantOrderId,
                responseCode,
                orderId,
                hashLength: responseHash.length,
                hashValue: responseHash,
                stage: 'RESPONSE_1',
                hashString: '[MASKED]'
            });

            return responseHash;
        } catch (error) {
            PaymentLogger.error('3D_HASH_CALC_ERROR', 'Hash hesaplama hatası', {
                errorMessage: error.message,
                errorName: error.name,
                stage: 'RESPONSE_1',
                errorStack: error.stack
            });
            throw error;
        }
    },

    // Hash doğrulama
    validateHash(receivedHash, calculatedHash) {
        try {
            // Hash'leri normalize et
            const normalizedReceived = receivedHash
                .replace(/\s+/g, '') // Boşlukları kaldır
                .replace(/-/g, '+')  // URL-safe karakterleri düzelt
                .replace(/_/g, '/');

            const normalizedCalculated = calculatedHash
                .replace(/\s+/g, '')
                .replace(/-/g, '+')
                .replace(/_/g, '/');

            // Hash'leri karşılaştır
            const isValid = normalizedReceived === normalizedCalculated;

            PaymentLogger.debug('3D_HASH_VALIDATION', 'Hash karşılaştırma', {
                receivedLength: normalizedReceived.length,
                calculatedLength: normalizedCalculated.length,
                isValid,
                received: normalizedReceived,
                calculated: normalizedCalculated
            });

            return isValid;
        } catch (error) {
            PaymentLogger.error('3D_HASH_VALIDATION_ERROR', error);
            throw error;
        }
    },

    // İkinci adım için ödeme verilerini hazırla
    prepare3DSecurePaymentData(extractedData, amount) {
        try {
            // Amount'u formatla
            const formattedAmount = formatAmount(amount);

            // Debug log: Başlangıç parametreleri
            PaymentLogger.debug('3D_PAYMENT_DATA_PREP', 'Ödeme verileri hazırlanıyor', {
                merchantOrderId: extractedData.merchantOrderId,
                amount: formattedAmount,
                md: extractedData.md
            });

            const paymentData = {
                APIVersion: 'TDV2.0.0',
                HashData: HashUtils.createKTProvisionHash({
                    merchantId: KuveytTurkConfig.auth.merchantId,
                    merchantOrderId: extractedData.merchantOrderId,
                    amount: formattedAmount,
                    username: KuveytTurkConfig.auth.username,
                    password: KuveytTurkConfig.auth.password  // Ham şifre kullanıyoruz
                }),
                MerchantId: KuveytTurkConfig.auth.merchantId,
                CustomerId: KuveytTurkConfig.auth.customerId,
                UserName: KuveytTurkConfig.auth.username,
                TransactionType: 'Sale',
                InstallmentCount: "0",
                Amount: formattedAmount,
                MerchantOrderId: extractedData.merchantOrderId,
                TransactionSecurity: 3,
                KuveytTurkVPosAdditionalData: {
                    AdditionalData: {
                        Key: 'MD',
                        Data: extractedData.md
                    }
                }
            };

            PaymentLogger.debug('3D_PAYMENT_DATA_PREPARED', 'Ödeme verileri hazırlandı', {
                paymentData: maskSensitiveData(paymentData)
            });

            return paymentData;
        } catch (error) {
            PaymentLogger.error('3D_PAYMENT_DATA_PREP_ERROR', error);
            throw new Error('Ödeme verileri hazırlanamadı');
        }
    }
};
