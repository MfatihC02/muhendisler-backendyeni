// handlers/order.js
import { User } from '../../models/user.model.js';
import { Order } from '../../models/order.model.js';
import { EVENTS } from '../events/index.js';
import winston from 'winston';

// Winston logger konfigürasyonu
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
            return `[${timestamp}] [ORDER-SOCKET] ${level}: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
        })
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'order-socket.log' })
    ]
});

export const initOrderHandlers = (io, socket) => {
    const user = socket.user;

    // Sipariş durumu güncelleme
    socket.on(EVENTS.ORDER.UPDATE_STATUS, async (data) => {
        try {
            logger.info('Sipariş durumu güncelleme isteği alındı', {
                userId: user.id,
                data
            });

            // Admin veya satıcı kontrolü
            if (user.role !== 'admin' && user.role !== 'seller') {
                logger.warn('Yetkisiz sipariş güncelleme denemesi', { userId: user.id });
                socket.emit(EVENTS.ORDER.ERROR, { message: 'Bu işlem için yetkiniz yok' });
                return;
            }

            const { orderId, status, note } = data;
            const order = await Order.findById(orderId);

            if (!order) {
                logger.warn('Sipariş bulunamadı', { orderId });
                socket.emit(EVENTS.ORDER.ERROR, { message: 'Sipariş bulunamadı' });
                return;
            }

            // Durumu güncelle
            await order.updateStatus(status, note);

            logger.info('Sipariş durumu güncellendi', {
                orderId,
                oldStatus: order.status,
                newStatus: status,
                updatedBy: user.id
            });

            // Müşteriye bildirim gönder
            io.to(`user:${order.user}`).emit(EVENTS.ORDER.STATUS_UPDATED, {
                orderId: order._id,
                status,
                note,
                updatedAt: new Date()
            });

            // Admin ve satıcılara bildirim gönder
            io.to('admin').to('seller').emit(EVENTS.ORDER.ADMIN_NOTIFICATION, {
                type: 'STATUS_UPDATE',
                orderId: order._id,
                status,
                updatedBy: user.id,
                updatedAt: new Date()
            });
        } catch (error) {
            logger.error('Sipariş durumu güncelleme hatası', {
                error: error.message,
                userId: user.id
            });

            socket.emit(EVENTS.ORDER.ERROR, {
                message: 'Sipariş durumu güncellenirken bir hata oluştu'
            });
        }
    });

    // Sipariş notu ekleme
    socket.on(EVENTS.ORDER.ADD_NOTE, async (data) => {
        try {
            logger.info('Sipariş notu ekleme isteği alındı', {
                userId: user.id,
                data
            });

            const { orderId, note } = data;
            const order = await Order.findById(orderId);

            if (!order) {
                logger.warn('Sipariş bulunamadı', { orderId });
                socket.emit(EVENTS.ORDER.ERROR, { message: 'Sipariş bulunamadı' });
                return;
            }

            // Müşteri sadece kendi siparişine not ekleyebilir
            if (user.role === 'customer' && order.user.toString() !== user.id) {
                logger.warn('Yetkisiz not ekleme denemesi', { userId: user.id });
                socket.emit(EVENTS.ORDER.ERROR, { message: 'Bu işlem için yetkiniz yok' });
                return;
            }

            // Not ekle
            order.notes.push({
                content: note,
                addedBy: user.id,
                userRole: user.role
            });
            await order.save();

            logger.info('Sipariş notu eklendi', {
                orderId,
                noteBy: user.id,
                userRole: user.role
            });

            // İlgili kullanıcılara bildirim gönder
            const notificationData = {
                orderId: order._id,
                note,
                addedBy: user.id,
                userRole: user.role,
                addedAt: new Date()
            };

            // Müşteriye bildirim
            io.to(`user:${order.user}`).emit(EVENTS.ORDER.NOTE_ADDED, notificationData);

            // Admin ve satıcılara bildirim
            io.to('admin').to('seller').emit(EVENTS.ORDER.NOTE_ADDED, notificationData);
        } catch (error) {
            logger.error('Sipariş notu ekleme hatası', {
                error: error.message,
                userId: user.id
            });

            socket.emit(EVENTS.ORDER.ERROR, {
                message: 'Sipariş notu eklenirken bir hata oluştu'
            });
        }
    });

    // Sipariş detayları talep etme
    socket.on(EVENTS.ORDER.REQUEST_DETAILS, async (data) => {
        try {
            logger.info('Sipariş detayları talebi alındı', {
                userId: user.id,
                data
            });

            const { orderId } = data;
            const order = await Order.findById(orderId)
                .populate('user', 'name email')
                .populate('items.product', 'name price')
                .populate('shippingAddress');

            if (!order) {
                logger.warn('Sipariş bulunamadı', { orderId });
                socket.emit(EVENTS.ORDER.ERROR, { message: 'Sipariş bulunamadı' });
                return;
            }

            // Müşteri sadece kendi siparişini görebilir
            if (user.role === 'customer' && order.user._id.toString() !== user.id) {
                logger.warn('Yetkisiz sipariş detayı görüntüleme denemesi', { userId: user.id });
                socket.emit(EVENTS.ORDER.ERROR, { message: 'Bu işlem için yetkiniz yok' });
                return;
            }

            socket.emit(EVENTS.ORDER.DETAILS, {
                orderId: order._id,
                user: {
                    id: order.user._id,
                    name: order.user.name,
                    email: order.user.email
                },
                items: order.items.map(item => ({
                    product: {
                        id: item.product._id,
                        name: item.product.name,
                        price: item.price
                    },
                    quantity: item.quantity,
                    unit: item.unit
                })),
                status: order.status,
                shippingAddress: order.shippingAddress,
                notes: order.notes,
                createdAt: order.createdAt,
                updatedAt: order.updatedAt
            });
        } catch (error) {
            logger.error('Sipariş detayları alma hatası', {
                error: error.message,
                userId: user.id
            });

            socket.emit(EVENTS.ORDER.ERROR, {
                message: 'Sipariş detayları alınırken bir hata oluştu'
            });
        }
    });
};
