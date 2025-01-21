import express from 'express';
import { verifyToken, isAdmin } from '../middlewares/auth.middleware.js';
import { 
    getProfile, 
    updateProfile, 
    changePassword,
    getAllUsers,
    getUserById,
    deleteUser,
    updateUserRole
} from '../controllers/user.controller.js';
import rateLimit from 'express-rate-limit';
import { cacheMiddleware, clearCacheMiddleware } from '../middleware/performance/cache.js';

const router = express.Router();

// Rate limiting middleware
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 dakika
    max: 100 // IP başına maksimum istek sayısı
});

// Tüm user routes'larda rate limiting ve token doğrulama kullan
router.use(limiter);
router.use(verifyToken);

// Normal kullanıcı routes
router.get('/profile', 
    cacheMiddleware('user', 60), // 1 dakika cache
    getProfile
);

router.put('/profile', 
    clearCacheMiddleware(['user']),
    updateProfile
);

router.put('/change-password', 
    clearCacheMiddleware(['user']),
    changePassword
);

// Admin routes
router.get('/', 
    isAdmin, 
    cacheMiddleware('user', 300), // 5 dakika cache
    getAllUsers
);

router.get('/:id', 
    isAdmin, 
    cacheMiddleware('user', 300),
    getUserById
);

router.delete('/:id', 
    isAdmin, 
    clearCacheMiddleware(['user', 'order', 'review']), // İlişkili cache'leri temizle
    deleteUser
);

router.put('/:id/role', 
    isAdmin, 
    clearCacheMiddleware(['user']),
    updateUserRole
);

export default router;
