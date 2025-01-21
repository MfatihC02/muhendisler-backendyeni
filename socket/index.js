import { Server } from 'socket.io';
import winston from 'winston';
import { socketAuthMiddleware } from './middleware/auth.js';
import { initProductHandlers } from './handlers/product.js';
import { initCategoryHandlers } from './handlers/category.js';
import initStockHandlers from './handlers/stock.js';
import { initOrderHandlers } from './handlers/order.js';
import { initPaymentHandlers } from './handlers/payment.js';
import cookieParser from 'cookie-parser';

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
            return `[${timestamp}] [SOCKET-MAIN] ${level}: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
        })
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'socket-main.log' })
    ]
});

let io;

export const getIO = () => {
    if (!io) {
        logger.error('Socket.IO instance not initialized');
        throw new Error('Socket.IO server not initialized!');
    }
    return io;
};

export const initSocket = (httpServer) => {
    if (io) {
        logger.warn('Socket.IO server already initialized');
        return io;
    }

    if (!process.env.JWT_ACCESS_SECRET) {
        throw new Error('JWT_ACCESS_SECRET is required');
    }

    logger.info('Initializing Socket.IO server');

    io = new Server(httpServer, {
        cors: {
            origin: process.env.FRONTEND_URL || "http://localhost:5173",
            methods: ["GET", "POST"],
            allowedHeaders: ["Cookie", "Set-Cookie", "content-type", "Authorization"],
            credentials: true
        },
        pingTimeout: 60000,
        pingInterval: 25000,
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        randomizationFactor: 0.5,
        transports: ['websocket', 'polling'],
        cookie: {
            name: "io",
            httpOnly: true,
            sameSite: "none"
        }
    });

    // Cookie parser middleware - JWT secret'ı kullanıyoruz
    io.engine.use((req, res, next) => {
        cookieParser(process.env.JWT_ACCESS_SECRET)(req, res, (err) => {
            if (err) {
                logger.error('Cookie parser error:', err);
                return next(err);
            }
            logger.info('Cookie parsed successfully', { cookies: req.cookies });
            next();
        });
    });

    // Connection monitoring
    const connectionStats = {
        totalConnections: 0,
        activeConnections: 0,
        errors: new Map(),
        lastError: null
    };

    // Auth middleware
    io.use(socketAuthMiddleware);

    // Connection handler
    io.on('connection', async (socket) => {
        try {
            connectionStats.totalConnections++;
            connectionStats.activeConnections++;

            socket.on('error', (error) => {
                logger.error('Socket error:', error);
                connectionStats.lastError = {
                    timestamp: new Date(),
                    error: error.message
                };
                
                const errorCount = connectionStats.errors.get(error.message) || 0;
                connectionStats.errors.set(error.message, errorCount + 1);
            });

            socket.on('disconnect', (reason) => {
                connectionStats.activeConnections--;
                logger.info('Client disconnected', { 
                    reason, 
                    remainingConnections: connectionStats.activeConnections 
                });
            });

            // Health check endpoint
            socket.on('health', (callback) => {
                callback({
                    status: 'healthy',
                    stats: {
                        totalConnections: connectionStats.totalConnections,
                        activeConnections: connectionStats.activeConnections,
                        lastError: connectionStats.lastError
                    }
                });
            });

            // Kullanıcı doğrulama kontrolü
            if (!socket.user) {
                logger.warn('Unauthorized connection attempt', { socketId: socket.id });
                socket.emit('auth_error', { message: 'Authentication required' });
                socket.disconnect(true);
                return;
            }

            logger.info('New client connected', {
                socketId: socket.id,
                userId: socket.user.id,
                userRole: socket.user.role
            });

            // Admin kullanıcıları için özel oda
            if (socket.user.role === 'admin') {
                try {
                    await socket.join('admin-room');
                    logger.info('Admin joined admin-room', {
                        socketId: socket.id,
                        userId: socket.user.id
                    });
                } catch (error) {
                    logger.error('Error joining admin room', {
                        error: error.message,
                        socketId: socket.id,
                        userId: socket.user.id
                    });
                }
            }

            // Handlers'ları başlat
            try {
                initProductHandlers(io, socket);
                initCategoryHandlers(io, socket);
                initStockHandlers(io, socket);
                initOrderHandlers(io, socket);
                initPaymentHandlers(io, socket);
            } catch (error) {
                logger.error('Error initializing handlers', {
                    error: error.message,
                    socketId: socket.id,
                    userId: socket.user.id
                });
            }

        } catch (error) {
            logger.error('Error in connection handler', {
                error: error.message,
                stack: error.stack,
                socketId: socket.id
            });
            socket.disconnect(true);
        }
    });

    // Error handling
    io.on('error', (error) => {
        logger.error('Socket.IO server error:', {
            error: error.message,
            stack: error.stack
        });
    });

    return io;
};

// Cleanup function
export const cleanupSocket = () => {
    if (io) {
        io.close();
        io = null;
        logger.info('Socket.IO server closed and cleaned up');
    }
};