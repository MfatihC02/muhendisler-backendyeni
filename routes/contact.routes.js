import express from 'express';
import { contactFormController } from '../controllers/contact.controller.js';

const router = express.Router();

// POST /api/contact
router.post('/', contactFormController);

export default router;
