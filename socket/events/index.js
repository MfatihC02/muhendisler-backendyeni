import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      return `[${timestamp}] [SOCKET-EVENTS] ${level}: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'socket-events.log' })
  ]
});

export const EVENTS = {
  PRODUCT: {
    CREATED: 'product:created',
    UPDATED: 'product:updated',
    DELETED: 'product:deleted',
    STOCK_UPDATED: 'product:stock:updated',
    PRICE_UPDATED: 'product:price:updated',
    STATUS_CHANGED: 'product:status:changed',
    LOW_STOCK: 'product:stock:low'
  },
  CATEGORY: {
    CREATED: 'category:created',
    UPDATED: 'category:updated',
    DELETED: 'category:deleted',
    STATUS_CHANGED: 'category:status:changed',
    TREE_UPDATED: 'category:tree:updated'
  },
  STOCK: {
    CREATED: 'stock:created',
    UPDATED: 'stock:updated',
    DELETED: 'stock:deleted',
    QUANTITY_UPDATED: 'stock:quantity:updated',
    RESERVATION_CREATED: 'stock:reservation:created',
    RESERVATION_CONFIRMED: 'stock:reservation:confirmed',
    RESERVATION_CANCELLED: 'stock:reservation:cancelled',
    LOW_STOCK_ALERT: 'stock:alert:low'
  },
  ORDER: {
    CREATED: 'order:created',
    UPDATED: 'order:updated',
    STATUS_CHANGED: 'order:status:changed',
    CANCELLED: 'order:cancelled',
    PAYMENT_STATUS_CHANGED: 'order:payment:status:changed',
    NOTE_ADDED: 'order:note:added',
    TIMELINE_UPDATED: 'order:timeline:updated'
  }
};

logger.info('Socket events initialized', { events: EVENTS });
