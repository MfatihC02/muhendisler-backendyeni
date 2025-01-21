import express from 'express';
import { CategoryController } from '../controllers/category.controller.js';
import { categoryValidation, validateResult } from '../middlewares/categoryValidation.middleware.js';
import { handleImageUpload } from '../middlewares/imageUpload.middleware.js';
import { verifyToken, checkRole } from '../middlewares/auth.middleware.js';

const router = express.Router();

// Public endpoints (hem user hem admin erişebilir)
router.get('/',
    categoryValidation.listValidation,
    validateResult,
    CategoryController.getAllCategories
);

router.get('/tree', CategoryController.getCategoryTree);
router.get('/:slug/products', CategoryController.getProductsByCategory);
router.get('/:id',
    categoryValidation.idValidation,
    validateResult,
    CategoryController.getCategoryById
);

// Protected endpoints (sadece admin erişebilir)
router.post('/',
    verifyToken,
    checkRole(['admin']),
    categoryValidation.createValidation,
    validateResult,
    handleImageUpload,
    CategoryController.createCategory
);

router.put('/:id',
    verifyToken,
    checkRole(['admin']),
    categoryValidation.updateValidation,
    validateResult,
    handleImageUpload,
    CategoryController.updateCategory
);

router.delete('/:id',
    verifyToken,
    checkRole(['admin']),
    categoryValidation.idValidation,
    validateResult,
    CategoryController.deleteCategory
);

router.put('/:id/status',
    verifyToken,
    checkRole(['admin']),
    categoryValidation.statusValidation,
    validateResult,
    CategoryController.updateCategoryStatus
);

export default router;