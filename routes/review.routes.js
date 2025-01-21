import { Router } from 'express';
import reviewController from '../controllers/review.controller.js';
import { verifyToken, isAdmin } from '../middlewares/auth.middleware.js';
import commentValidator from '../middlewares/commentValidator.js';
import { cacheMiddleware, clearCacheMiddleware } from '../middleware/performance/cache.js';

const router = Router();

// Public routes (Herkes erişebilir)
router.get('/product/:productId', 
    cacheMiddleware('review', 300), // 5 dakika cache
    reviewController.getProductReviews
);

// User routes (Giriş yapmış kullanıcılar)
router.use(verifyToken); // Bundan sonraki tüm route'lar için token gerekli

router.post('/', 
    commentValidator, 
    clearCacheMiddleware(['review', 'product']), // Hem review hem product cache'ini temizle
    reviewController.createReview
);

router.put('/:id', 
    commentValidator, 
    clearCacheMiddleware(['review', 'product']),
    reviewController.updateReview
);

router.delete('/:id', 
    clearCacheMiddleware(['review', 'product']),
    reviewController.deleteReview
);

router.get('/user', 
    cacheMiddleware('review', 300),
    reviewController.getUserReviews
);

// Admin routes
router.use(isAdmin); // Bundan sonraki tüm route'lar için admin yetkisi gerekli

router.get('/admin/all', 
    cacheMiddleware('review', 300),
    reviewController.getAllReviews
);

router.delete('/admin/:id', 
    clearCacheMiddleware(['review', 'product']),
    reviewController.deleteReviewAdmin
);

router.put('/admin/:id', 
    commentValidator, 
    clearCacheMiddleware(['review', 'product']),
    reviewController.updateReviewAdmin
);

export default router;
