// handlers/stock.js
import { User } from '../../models/user.model.js';
import { Stock } from '../../models/stock.model.js';
import { EVENTS } from '../events/index.js';
import winston from 'winston';

// Winston logger konfigürasyonu
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
            return `[${timestamp}] [STOCK-SOCKET] ${level}: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
        })
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'stock-socket.log' })
    ]
});

const initStockHandlers = (io, socket) => {
    const user = socket.user;

    // Event buffering için queue
    const eventQueue = new Map();
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 1000;

    const processStockUpdate = async (data, retryCount = 0) => {
        try {
            const { productId, quantity } = data;
            const stock = await Stock.findOne({ product: productId });

            if (!stock) {
                throw new Error('Stock not found');
            }

            stock.quantity = quantity;
            await stock.save();

            // Başarılı işlem sonrası queue'dan kaldır
            eventQueue.delete(productId);
            
            // Broadcast the update
            io.emit(EVENTS.STOCK.UPDATED, {
                productId,
                quantity: stock.quantity
            });

            logger.info('Stock update successful', { productId, quantity });
        } catch (error) {
            logger.error('Stock update failed', { error: error.message, retryCount });

            if (retryCount < MAX_RETRIES) {
                setTimeout(() => {
                    processStockUpdate(data, retryCount + 1);
                }, RETRY_DELAY * Math.pow(2, retryCount));
            } else {
                logger.error('Max retries reached for stock update', { data });
                socket.emit(EVENTS.STOCK.ERROR, { 
                    message: 'Stock update failed after multiple attempts',
                    productId: data.productId
                });
            }
        }
    };

    // Stok güncellemelerini dinle
    socket.on(EVENTS.STOCK.UPDATE, async (data) => {
        try {
            logger.info('Stok güncelleme isteği alındı', { userId: user.id, data });

            // Admin kontrolü
            if (user.role !== 'admin') {
                logger.warn('Yetkisiz stok güncelleme denemesi', { userId: user.id });
                socket.emit(EVENTS.STOCK.ERROR, { message: 'Bu işlem için yetkiniz yok' });
                return;
            }

            // Queue'ya ekle ve işleme al
            eventQueue.set(data.productId, data);
            await processStockUpdate(data);

        } catch (error) {
            logger.error('Error in stock update handler', { error: error.message });
            socket.emit(EVENTS.STOCK.ERROR, { message: error.message });
        }
    });

    // Stok rezervasyonu yap
    socket.on(EVENTS.STOCK.RESERVE, async (data) => {
        try {
            logger.info('Stok rezervasyon isteği alındı', { userId: user.id, data });

            const { productId, quantity, orderId } = data;
            const stock = await Stock.findOne({ product: productId });

            if (!stock) {
                logger.warn('Stok bulunamadı', { productId });
                socket.emit(EVENTS.STOCK.ERROR, { message: 'Stok bulunamadı' });
                return;
            }

            if (!stock.canReserve(quantity)) {
                logger.warn('Yetersiz stok', {
                    productId,
                    requested: quantity,
                    available: stock.quantity
                });

                socket.emit(EVENTS.STOCK.ERROR, { message: 'Yetersiz stok' });
                return;
            }

            // Rezervasyon oluştur
            const reservation = await stock.createReservation(quantity, orderId);

            logger.info('Stok rezervasyonu oluşturuldu', {
                productId,
                quantity,
                orderId,
                reservationId: reservation._id
            });

            // Rezervasyon bilgisini gönder
            socket.emit(EVENTS.STOCK.RESERVED, {
                reservationId: reservation._id,
                productId,
                quantity,
                expiresAt: reservation.expiresAt
            });

            // Admins ve satıcılara bilgi ver
            io.to('admin').to('seller').emit(EVENTS.STOCK.RESERVATION_CREATED, {
                productId,
                quantity,
                remainingStock: stock.quantity - quantity
            });
        } catch (error) {
            logger.error('Stok rezervasyon hatası', {
                error: error.message,
                userId: user.id
            });

            socket.emit(EVENTS.STOCK.ERROR, {
                message: 'Rezervasyon oluşturulurken bir hata oluştu'
            });
        }
    });

    // Stok bilgisi talep et
    socket.on(EVENTS.STOCK.REQUEST_INFO, async (data) => {
        try {
            logger.info('Stok bilgisi talebi alındı', { userId: user.id, data });

            const { productId } = data;
            const stock = await Stock.findOne({ product: productId })
                .populate('product', 'name price');

            if (!stock) {
                logger.warn('Stok bulunamadı', { productId });
                socket.emit(EVENTS.STOCK.ERROR, { message: 'Stok bulunamadı' });
                return;
            }

            socket.emit(EVENTS.STOCK.INFO, {
                productId: stock.product._id,
                productName: stock.product.name,
                quantity: stock.quantity,
                unit: stock.unit,
                lowStockThreshold: stock.lowStockThreshold,
                updatedAt: stock.updatedAt
            });
        } catch (error) {
            logger.error('Stok bilgisi alma hatası', {
                error: error.message,
                userId: user.id
            });

            socket.emit(EVENTS.STOCK.ERROR, {
                message: 'Stok bilgisi alınırken bir hata oluştu'
            });
        }
    });
};

export default initStockHandlers;
