import winston from 'winston';
import path from 'path';

// Performans logger'ı için özel format
const performanceFormat = winston.format.printf(({ timestamp, level, message, ...meta }) => {
    return JSON.stringify({
        timestamp,
        level,
        message,
        ...meta
    });
});

// Performans logger'ı oluştur
const performanceLogger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        performanceFormat
    ),
    transports: [
        new winston.transports.File({ 
            filename: path.join(process.cwd(), 'logs', 'performance.log'),
            level: 'info'
        })
    ]
});

// Performans middleware
const performanceMetrics = (req, res, next) => {
    // Başlangıç zamanı ve memory kullanımı
    const start = process.hrtime();
    const startMemory = process.memoryUsage();

    // Response gönderilmeden önce çalışacak
    res.on('header', () => {
        // Süre hesaplama
        const diff = process.hrtime(start);
        const time = (diff[0] * 1e9 + diff[1]) / 1e6; // nanoseconds to milliseconds
        
        // Header'ı ekle
        if (!res.headersSent) {
            res.set('Server-Timing', `total;dur=${time}`);
        }
    });

    // Response tamamlandığında çalışacak
    res.on('finish', () => {
        // Süre hesaplama
        const diff = process.hrtime(start);
        const time = (diff[0] * 1e9 + diff[1]) / 1e6;

        // Memory kullanım farkı
        const endMemory = process.memoryUsage();
        const memoryDiff = {
            heapUsed: Math.round((endMemory.heapUsed - startMemory.heapUsed) / 1024 / 1024 * 100) / 100,
            heapTotal: Math.round((endMemory.heapTotal - startMemory.heapTotal) / 1024 / 1024 * 100) / 100,
            external: Math.round((endMemory.external - startMemory.external) / 1024 / 1024 * 100) / 100
        };

        // Performans metriklerini logla
        performanceLogger.info('API Performance Metrics', {
            path: req.originalUrl,
            method: req.method,
            statusCode: res.statusCode,
            duration: `${time}ms`,
            memoryUsage: memoryDiff,
            query: req.query,
            contentLength: res.get('content-length'),
            userAgent: req.get('user-agent')
        });
    });

    // Bir sonraki middleware'e geç
    next();
};

export default performanceMetrics;
