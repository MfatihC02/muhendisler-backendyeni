import jwt from 'jsonwebtoken';
import winston from 'winston';

// Logger configuration with more detailed error formatting
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      return `[${timestamp}] [SOCKET-AUTH] ${level}: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'socket-auth.log' })
  ]
});

// Custom error classes for better error handling
class AuthenticationError extends Error {
  constructor(message, type, details = {}) {
    super(message);
    this.name = 'AuthenticationError';
    this.type = type;
    this.details = details;
  }
}

class TokenError extends AuthenticationError {
  constructor(message, details = {}) {
    super(message, 'TOKEN_ERROR', details);
  }
}

// Enhanced cookie validation
const validateCookie = (cookies, socketId) => {
  // Check if cookies exist
  if (!cookies || typeof cookies !== 'object') {
    throw new AuthenticationError(
      'No cookies found',
      'COOKIE_ERROR',
      { socketId, cookiesReceived: typeof cookies }
    );
  }

  // Log available cookies (without sensitive data)
  logger.debug('Available cookies', {
    socketId,
    cookieKeys: Object.keys(cookies)
  });

  // Check for access token
  const token = cookies['access_token'];

  if (!token) {
    throw new TokenError('Access token missing', {
      socketId,
      availableCookies: Object.keys(cookies)
    });
  }

  if (typeof token !== 'string') {
    throw new TokenError('Invalid token type', {
      socketId,
      tokenType: typeof token
    });
  }

  // Basic token format validation (JWT format: xxx.yyy.zzz)
  const tokenParts = token.split('.');
  if (tokenParts.length !== 3) {
    throw new TokenError('Invalid token structure', {
      socketId,
      tokenFormat: `${tokenParts.length} parts instead of 3`
    });
  }

  return token;
};

// Enhanced token verification
const verifyToken = async (token, socketId) => {
  try {
    if (!process.env.JWT_ACCESS_SECRET) {
      throw new AuthenticationError(
        'JWT secret not configured',
        'CONFIG_ERROR',
        { socketId }
      );
    }

    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET, {
      algorithms: ['HS256']
    });

    // Validate token payload
    if (!decoded.id || !decoded.role) {
      throw new TokenError('Invalid token payload', {
        socketId,
        missingFields: ['id', 'role'].filter(field => !decoded[field])
      });
    }

    return decoded;
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      throw new TokenError('JWT verification failed', {
        socketId,
        jwtError: error.message
      });
    }
    throw error;
  }
};

// Main middleware with enhanced error handling
export const socketAuthMiddleware = async (socket, next) => {
  try {
    // Validate socket
    if (!socket || !socket.request) {
      throw new AuthenticationError(
        'Invalid socket connection',
        'SOCKET_ERROR',
        { socketId: socket?.id }
      );
    }

    const socketId = socket.id;
    const clientIp = socket.request.connection.remoteAddress;

    logger.info('Authentication attempt', {
      socketId,
      clientIp,
      timestamp: new Date().toISOString()
    });

    // Validate and get token
    const token = validateCookie(socket.request.cookies, socketId);


    // Verify token
    const decoded = await verifyToken(token, socketId);
    console.log('Decoded User:', decoded);

    // Set user data
    socket.user = {
      id: decoded.id,
      role: decoded.role,
      authenticatedAt: new Date().toISOString()
    };

    logger.info('Authentication successful', {
      socketId,
      userId: decoded.id,
      userRole: decoded.role
    });

    next();
  } catch (error) {
    // Enhanced error logging
    if (error instanceof AuthenticationError) {
      logger.error(`Authentication error: ${error.type}`, {
        socketId: socket?.id,
        errorType: error.type,
        errorMessage: error.message,
        details: error.details,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    } else {
      logger.error('Unexpected authentication error', {
        socketId: socket?.id,
        errorType: error.name,
        errorMessage: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }

    // Send appropriate error to client
    next(new Error(process.env.NODE_ENV === 'development'
      ? error.message
      : 'Authentication failed'));
  }
};

// Usage example with frontend error handling
const connectSocketWithRetry = () => {
  const socket = io(SOCKET_URL, {
    withCredentials: true,
    reconnection: true,
    reconnectionAttempts: 3,
    reconnectionDelay: 1000
  });

  socket.on('connect_error', (error) => {
    logger.error('Socket connection error', {
      errorMessage: error.message,
      timestamp: new Date().toISOString()
    });

    // Handle specific error cases
    if (error.message.includes('Authentication failed')) {
      // Redirect to login or refresh token
      window.location.href = '/login';
    }
  });

  return socket;
};