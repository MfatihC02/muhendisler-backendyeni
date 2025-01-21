import express from 'express';
import { addressController } from '../controllers/address.controller.js';
import { validateAddress, validateAddressId } from '../middlewares/address.validator.js';
import { verifyToken } from '../middlewares/auth.middleware.js';
const router = express.Router();

// Tüm rotalar için authentication gerekli
router.use(verifyToken);

// Ana adres işlemleri
router.route('/')
    .get(addressController.getAllAddresses)
    .post(validateAddress, addressController.createAddress);

// Varsayılan adres işlemleri
router.get('/default', addressController.getDefaultAddress);

// Şehir ve ilçe bilgileri
router.get('/cities', addressController.getCities);
router.get('/districts/:city', addressController.getDistricts);

// Tekil adres işlemleri
router.route('/:id')
    .get(validateAddressId, addressController.getAddress)
    .put(validateAddressId, validateAddress, addressController.updateAddress)
    .delete(validateAddressId, addressController.deleteAddress);

// Admin rotaları
router.get('/admin/addresses', addressController.getAllUsersAddresses);
router.get('/admin/user/:userId/addresses', addressController.getUserAddresses);
router.put('/admin/address/:id', validateAddress, addressController.adminUpdateAddress);
router.delete('/admin/address/:id', addressController.adminDeleteAddress);

export default router;
