// handlers/product.js
import { User } from '../../models/user.model.js';
import { EVENTS } from '../events/index.js';
import winston from 'winston';

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'product-handlers.log' })
    ]
});

export const initProductHandlers = (socket) => {
    try {
        // Kullanıcı kontrolü - socket.user objesinin tanımlı olup olmadığını logluyoruz
        logger.info('Initializing product handlers', {
            socketId: socket.id,
            userExists: !!socket.user,
            userId: socket.user?.id,
            userRole: socket.user?.role
        });

        if (!socket.user || !socket.user.id) {
            logger.warn('Socket user not authenticated or missing ID', {
                socketId: socket.id,
                user: socket.user
            });
            return;
        }

        // Admin kullanıcılar için event handler'lar
        if (socket.user.role === 'admin') {

            // Stok güncelleme event handler'ı
            socket.on(EVENTS.PRODUCT.STOCK_UPDATED, async (data) => {
                logger.info('Received STOCK_UPDATED event', { socketId: socket.id, data });

                if (!data || !data.productId || typeof data.newStock !== 'number') {
                    logger.error('Invalid data received for STOCK_UPDATED event', {
                        socketId: socket.id,
                        data
                    });
                    return;
                }

                if (!socket.user || !socket.user.id) {
                    logger.error('User information missing during STOCK_UPDATED event', {
                        socketId: socket.id,
                        user: socket.user
                    });
                    return;
                }

                try {
                    logger.info('Processing stock update', {
                        productId: data.productId,
                        newStock: data.newStock,
                        userId: socket.user.id
                    });

                    // Broadcast stock update event
                    socket.broadcast.emit(EVENTS.PRODUCT.STOCK_UPDATED, {
                        productId: data.productId,
                        newStock: data.newStock,
                        timestamp: new Date().toISOString()
                    });

                    logger.info('Stock update broadcasted successfully', {
                        productId: data.productId,
                        newStock: data.newStock
                    });
                } catch (error) {
                    logger.error('Error in stock update handler', {
                        error: error.message,
                        stack: error.stack,
                        productId: data?.productId,
                        socketId: socket.id
                    });
                }
            });

            // Fiyat güncelleme event handler'ı
            socket.on(EVENTS.PRODUCT.PRICE_UPDATED, async (data) => {
                logger.info('Received PRICE_UPDATED event', { socketId: socket.id, data });

                if (!data || !data.productId || typeof data.newPrice !== 'number') {
                    logger.error('Invalid data received for PRICE_UPDATED event', {
                        socketId: socket.id,
                        data
                    });
                    return;
                }

                try {
                    logger.info('Processing price update', {
                        productId: data.productId,
                        newPrice: data.newPrice,
                        userId: socket.user.id
                    });

                    // Broadcast price update event
                    socket.broadcast.emit(EVENTS.PRODUCT.PRICE_UPDATED, {
                        productId: data.productId,
                        newPrice: data.newPrice,
                        timestamp: new Date().toISOString()
                    });

                    logger.info('Price update broadcasted successfully', {
                        productId: data.productId,
                        newPrice: data.newPrice
                    });
                } catch (error) {
                    logger.error('Error in price update handler', {
                        error: error.message,
                        stack: error.stack,
                        productId: data?.productId,
                        socketId: socket.id
                    });
                }
            });
        }

        // Ürün oluşturma event handler'ı
        socket.on(EVENTS.PRODUCT.CREATED, async (data) => {
            logger.info('Received PRODUCT.CREATED event', {
                socketId: socket.id,
                data,
                currentUser: socket.user
            });

            if (!socket.user || !socket.user.id) {
                logger.error('User not found during PRODUCT.CREATED event', {
                    socketId: socket.id,
                    currentUser: socket.user
                });
                return;
            }

            try {
                socket.broadcast.emit(EVENTS.PRODUCT.CREATED, {
                    productId: data.productId,
                    timestamp: new Date().toISOString()
                });

                logger.info('Product creation broadcasted successfully', {
                    productId: data.productId
                });
            } catch (error) {
                logger.error('Error in product create handler', {
                    error: error.message,
                    stack: error.stack,
                    productId: data?.productId,
                    socketId: socket.id
                });
            }
        });

        // Error handler
        socket.on('error', (error) => {
            logger.error('Socket error in product handlers', {
                error: error.message,
                stack: error.stack,
                socketId: socket.id,
                userId: socket.user?.id
            });
        });

        logger.info('Product handlers initialized successfully', {
            socketId: socket.id,
            userId: socket.user.id
        });

    } catch (error) {
        logger.error('Error initializing product handlers', {
            error: error.message,
            stack: error.stack,
            socketId: socket.id,
            user: socket.user
        });
    }
};
