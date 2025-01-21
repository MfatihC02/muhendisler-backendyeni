import { EVENTS } from '../events/index.js';
import winston from 'winston';

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
            return `[${timestamp}] [SOCKET-CATEGORY-HANDLER] ${level}: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
        })
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'socket-category-handler.log' })
    ]
});

export const initCategoryHandlers = (io, socket) => {
    logger.info('Initializing category handlers', {
        socketId: socket.id,
        userId: socket.user?.id,
        userRole: socket.user?.role
    });

    if (socket.user?.role === 'admin') {
        socket.on(EVENTS.CATEGORY.UPDATED, async (data) => {
            try {
                logger.info('Category update event received', {
                    socketId: socket.id,
                    userId: socket.user?.id,
                    categoryId: data?.categoryId,
                    updates: data?.updates
                });

                io.emit(EVENTS.CATEGORY.UPDATED, {
                    categoryId: data.categoryId,
                    updates: data.updates
                });

                logger.info('Category update event broadcasted', {
                    socketId: socket.id,
                    categoryId: data?.categoryId
                });
            } catch (error) {
                logger.error('Error in category update handler', {
                    socketId: socket.id,
                    error: error.message,
                    stack: error.stack,
                    categoryId: data?.categoryId
                });
            }
        });

        socket.on(EVENTS.CATEGORY.STATUS_CHANGED, async (data) => {
            try {
                logger.info('Category status change event received', {
                    socketId: socket.id,
                    userId: socket.user?.id,
                    categoryId: data?.categoryId,
                    isActive: data?.isActive
                });

                io.emit(EVENTS.CATEGORY.STATUS_CHANGED, {
                    categoryId: data.categoryId,
                    isActive: data.isActive
                });

                logger.info('Category status change event broadcasted', {
                    socketId: socket.id,
                    categoryId: data?.categoryId
                });
            } catch (error) {
                logger.error('Error in category status change handler', {
                    socketId: socket.id,
                    error: error.message,
                    stack: error.stack,
                    categoryId: data?.categoryId
                });
            }
        });

        logger.info('Category handlers initialized for admin user', {
            socketId: socket.id,
            userId: socket.user?.id
        });
    } else {
        logger.warn('Non-admin user attempted to initialize category handlers', {
            socketId: socket.id,
            userId: socket.user?.id,
            userRole: socket.user?.role
        });
    }
};
