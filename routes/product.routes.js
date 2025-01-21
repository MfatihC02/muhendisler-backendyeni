import express from 'express';
import * as productController from '../controllers/product.controller.js';
import { verifyToken, checkRole } from '../middlewares/auth.middleware.js';
import { handleImageUpload } from '../middlewares/imageUpload.middleware.js';
import multer from 'multer';
import { cacheMiddleware, clearCacheMiddleware } from '../middleware/performance/cache.js';

const router = express.Router();

// Çoklu resim yükleme için multer konfigürasyonu
const upload = multer({
    storage: multer.memoryStorage(),
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Desteklenmeyen dosya formatı'), false);
        }
    },
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
        files: 10 // maksimum 10 dosya
    }
}).single('image');

// Public routes
router.get('/', cacheMiddleware('product'), productController.getProducts);
router.get('/:id', cacheMiddleware('product'), productController.getProduct);
router.get('/slug/:slug', cacheMiddleware('product'), productController.getProductBySlug);

// Protected routes - Admin only
router.post('/',
    verifyToken,
    checkRole(['admin']),
    handleImageUpload,  // Tek bir image upload middleware'i
    clearCacheMiddleware('product'),
    productController.createProduct
);

router.put('/:id',
    verifyToken,
    checkRole(['admin']),
    upload,
    clearCacheMiddleware('product'),
    productController.updateProduct
);

router.delete('/:id',
    verifyToken,
    checkRole(['admin']),
    clearCacheMiddleware('product'),
    productController.deleteProduct
);

router.delete('/:id/images/:imageId',
    verifyToken,
    checkRole(['admin']),
    productController.deleteProductImage
);

router.patch('/:id/images/order',
    verifyToken,
    checkRole(['admin']),
    productController.updateImageOrder
);

export default router;