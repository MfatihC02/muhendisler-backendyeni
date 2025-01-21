import NodeCache from 'node-cache';

// Cache instance
export const cacheInstance = new NodeCache({
    stdTTL: 300, // 5 dakika default TTL
    checkperiod: 600, // 10 dakika cleanup period
    useClones: false, // Performans için clone'lamayı kapat
    deleteOnExpire: true // Expire olan verileri otomatik sil
});

// Cache configuration
export const cacheConfig = {
    enabled: process.env.ENABLE_CACHE !== 'false', // Varsayılan olarak aktif
    ttl: {
        product: 300,        // 5 dakika
        category: 600,       // 10 dakika
        stock: 60,          // 1 dakika
        cart: 300,          // 5 dakika
        order: 600,         // 10 dakika
        payment: 60         // 1 dakika
    },
    prefix: {
        product: 'prd:',
        category: 'cat:',
        stock: 'stk:',
        cart: 'crt:',
        order: 'ord:',
        payment: 'pay:'
    },
    maxSize: 1000, // Maximum cache item sayısı
    maxMemorySize: 512 // MB cinsinden maximum memory kullanımı
};

// Cache utilities
export const cacheUtils = {
    // Memory kullanımını kontrol et
    checkMemoryUsage: () => {
        const used = process.memoryUsage().heapUsed / 1024 / 1024;
        return used < cacheConfig.maxMemorySize;
    },

    // Cache stats
    getStats: () => {
        return {
            keys: cacheInstance.keys().length,
            hits: cacheInstance.getStats().hits,
            misses: cacheInstance.getStats().misses,
            memory: process.memoryUsage().heapUsed / 1024 / 1024
        };
    },

    // Cache temizleme
    clearCache: (pattern) => {
        const keys = cacheInstance.keys();
        const matchingKeys = keys.filter(key => key.includes(pattern));
        matchingKeys.forEach(key => cacheInstance.del(key));
    }
};
