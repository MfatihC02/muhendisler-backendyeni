// socket/handlers/payment.js
import winston from 'winston';
import { Payment } from '../../models/payment.model.js';

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
            return `[${timestamp}] [SOCKET-PAYMENT] ${level}: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
        })
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'socket-payment.log' })
    ]
});

export const initPaymentHandlers = (io, socket) => {
    // Kullanıcının kendi ödeme odalarına katılması
    const joinUserPaymentRooms = async () => {
        try {
            const userPayments = await Payment.find({ 
                userId: socket.user._id,
                status: { $in: ['PENDING', 'PROCESSING', '3D_AUTH'] }
            });

            for (const payment of userPayments) {
                await socket.join(`payment_${payment._id}`);
                logger.info(`User joined payment room: payment_${payment._id}`, {
                    userId: socket.user._id,
                    paymentId: payment._id
                });
            }
        } catch (error) {
            logger.error('Error joining payment rooms:', error);
        }
    };

    // Admin tüm aktif ödeme odalarına katılır
    const joinAdminPaymentRooms = async () => {
        try {
            const activePayments = await Payment.find({
                status: { $in: ['PENDING', 'PROCESSING', '3D_AUTH'] }
            });

            for (const payment of activePayments) {
                await socket.join(`payment_${payment._id}`);
                logger.info(`Admin joined payment room: payment_${payment._id}`, {
                    adminId: socket.user._id,
                    paymentId: payment._id
                });
            }
        } catch (error) {
            logger.error('Error joining admin payment rooms:', error);
        }
    };

    // Ödeme durumu izleme
    socket.on('payment:subscribe', async ({ paymentId }) => {
        try {
            const payment = await Payment.findById(paymentId);
            if (!payment) {
                socket.emit('payment:error', { message: 'Ödeme bulunamadı' });
                return;
            }

            // Yetki kontrolü
            if (payment.userId.toString() !== socket.user._id.toString() && socket.user.role !== 'admin') {
                socket.emit('payment:error', { message: 'Bu ödemeyi görüntüleme yetkiniz yok' });
                return;
            }

            await socket.join(`payment_${paymentId}`);
            logger.info(`Client subscribed to payment: ${paymentId}`, {
                userId: socket.user._id,
                socketId: socket.id
            });

            // Mevcut durumu gönder
            socket.emit('payment:status', {
                paymentId: payment._id,
                status: payment.status,
                timestamp: payment.updatedAt,
                details: {
                    amount: payment.amount,
                    lastStatus: payment.statusHistory[payment.statusHistory.length - 1]
                }
            });
        } catch (error) {
            logger.error('Payment subscribe error:', error);
            socket.emit('payment:error', { message: 'Ödeme takibi başlatılamadı' });
        }
    });

    // Ödeme takibini bırakma
    socket.on('payment:unsubscribe', async ({ paymentId }) => {
        await socket.leave(`payment_${paymentId}`);
        logger.info(`Client unsubscribed from payment: ${paymentId}`, {
            userId: socket.user._id,
            socketId: socket.id
        });
    });

    // Bağlantı başlangıcında oda katılımları
    if (socket.user.role === 'admin') {
        joinAdminPaymentRooms();
    } else {
        joinUserPaymentRooms();
    }

    // Cleanup on disconnect
    socket.on('disconnect', () => {
        logger.info('Client disconnected from payment handlers', {
            userId: socket.user._id,
            socketId: socket.id
        });
    });
};

// Payment event emitter fonksiyonları
export const emitPaymentEvent = (io, eventName, paymentId, data) => {
    try {
        io.to(`payment_${paymentId}`).emit(`payment:${eventName}`, {
            paymentId,
            timestamp: new Date(),
            ...data
        });

        // Admin odasına da bildirim gönder
        io.to('admin-room').emit(`payment:${eventName}`, {
            paymentId,
            timestamp: new Date(),
            ...data
        });

        logger.info(`Payment event emitted: ${eventName}`, {
            paymentId,
            data
        });
    } catch (error) {
        logger.error(`Error emitting payment event: ${eventName}`, error);
    }
};
