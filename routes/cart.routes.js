import express from 'express';
import { 
    addToCart, 
    getCart, 
    removeFromCart, 
    updateCartItem,
    validateCartItems,
    startCheckoutProcess,
    refreshCartReservations,
    clearCart
} from '../controllers/cart.controller.js';
import { verifyToken } from '../middlewares/auth.middleware.js';
import { validateSchema } from '../middlewares/validation.js';
import { addToCartSchema, updateCartItemSchema } from '../middlewares/cart.validation.js';

const router = express.Router();

// Mevcut rotalar korunuyor
router.post('/', verifyToken, validateSchema(addToCartSchema), addToCart);
router.get('/', verifyToken, getCart);
router.delete('/', verifyToken, clearCart);
router.delete('/:productId', verifyToken, removeFromCart);
router.put('/:productId', verifyToken, validateSchema(updateCartItemSchema), updateCartItem);

// Yeni rotalar ekleniyor
router.post('/validate', verifyToken, validateCartItems);
router.post('/checkout/start', verifyToken, startCheckoutProcess);
router.post('/reservations/refresh', verifyToken, refreshCartReservations);

export default router;
