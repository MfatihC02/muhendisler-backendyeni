import { Router } from 'express';
import authController from '../controllers/auth.controller.js';
import { verifyToken } from '../middlewares/auth.middleware.js';

const router = Router();

router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/logout', verifyToken, authController.logout);
router.post('/refresh-token', authController.refreshToken); // Yeni eklenen endpoint
router.get('/check', verifyToken, authController.checkAuth);

export default router;