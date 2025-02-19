import express from 'express';
import sitemapController from '../controllers/sitemap.controller.js';
import { cacheMiddleware } from '../middleware/performance/cache.js';

const router = express.Router();

// Sitemap endpoint'i - 1 saatlik cache ile
router.get('/sitemap.xml',
    cacheMiddleware('sitemap', 3600), // 1 saat = 3600 saniye
    sitemapController.generateSitemap
);

export default router; 