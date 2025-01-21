import { cacheInstance, cacheConfig, cacheUtils } from '../../config/cache.config.js';

// Ana cache middleware
export const cacheMiddleware = (type, customTTL = null) => {
    return (req, res, next) => {
        // Cache devre dışı ise bypass
        if (!cacheConfig.enabled) return next();

        // Memory limit kontrolü
        if (!cacheUtils.checkMemoryUsage()) {
            console.warn('Cache memory limit exceeded, bypassing cache');
            return next();
        }

        try {
            // Cache key oluştur
            const prefix = cacheConfig.prefix[type] || '';
            const key = `${prefix}${req.originalUrl}`;

            // Cache'de var mı kontrol et
            const cachedData = cacheInstance.get(key);
            if (cachedData) {
                return res.json(cachedData);
            }

            // Orijinal json metodunu yakala
            const originalJson = res.json;
            res.json = function(data) {
                // Cache'e kaydet
                const ttl = customTTL || cacheConfig.ttl[type];
                if (data && data.success !== false) {
                    cacheInstance.set(key, data, ttl);
                }
                originalJson.call(this, data);
            };

            next();
        } catch (error) {
            console.error('Cache middleware error:', error);
            next();
        }
    };
};

// Cache temizleme middleware
export const clearCacheMiddleware = (type) => {
    return (req, res, next) => {
        try {
            const prefix = cacheConfig.prefix[type] || '';
            cacheUtils.clearCache(prefix);
        } catch (error) {
            console.error('Clear cache middleware error:', error);
        }
        next();
    };
};

// Monitoring middleware
export const monitorMiddleware = (req, res, next) => {
    const start = Date.now();
    
    res.on('finish', () => {
        const duration = Date.now() - start;
        const stats = cacheUtils.getStats();
        
        console.log(`
            Path: ${req.method} ${req.url}
            Duration: ${duration}ms
            Cache Stats:
            - Hit Rate: ${((stats.hits / (stats.hits + stats.misses)) * 100).toFixed(2)}%
            - Memory: ${stats.memory.toFixed(2)}MB
        `);
    });
    
    next();
};
