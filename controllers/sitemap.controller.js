import { Category } from '../models/category.model.js';
import xmlbuilder from 'xmlbuilder';
import mongoose from 'mongoose';
const Product = mongoose.model('Product');

class SitemapController {
    constructor() {
        // bind işlemi ekleyelim
        this.generateSitemap = this.generateSitemap.bind(this);
        this.buildCategoryPath = this.buildCategoryPath.bind(this);
        // Site URL'ini sabit olarak tanımlayalım
        this.siteUrl = 'https://www.tarimsepetim.com.tr';
    }

    async generateSitemap(req, res) {
        try {
            // Statik URL'ler
            const staticUrls = [
                {
                    url: '/',
                    changefreq: 'daily',
                    priority: 1.0
                },
                {
                    url: '/gizlilik-politikasi',
                    changefreq: 'monthly',
                    priority: 0.3
                },
                {
                    url: '/iade-ve-iptal-kosullari',
                    changefreq: 'monthly',
                    priority: 0.3
                },
                {
                    url: '/hakkimizda',
                    changefreq: 'monthly',
                    priority: 0.5
                },
                {
                    url: '/iletisim',
                    changefreq: 'monthly',
                    priority: 0.5
                }
            ];

            // Ürün URL'lerini al
            const products = await Product.find({ status: 'active' })
                .select('slug updatedAt')
                .lean();

            const productUrls = products.map(product => ({
                url: `/urun/${product.slug}`,
                lastmod: product.updatedAt,
                changefreq: 'daily',
                priority: 0.8
            }));

            // Kategori URL'lerini al
            const categories = await Category.find({ isActive: true })
                .select('slug updatedAt ancestors')
                .lean();

            const categoryUrls = categories.map((category) => ({
                url: `/kategori/${this.buildCategoryPath(category)}`,
                lastmod: category.updatedAt,
                changefreq: 'weekly',
                priority: 0.6
            }));

            // Tüm URL'leri birleştir
            const allUrls = [...staticUrls, ...productUrls, ...categoryUrls];

            // XML oluştur
            const xml = xmlbuilder.create('urlset', {
                version: '1.0',
                encoding: 'UTF-8'
            })
                .att('xmlns', 'http://www.sitemaps.org/schemas/sitemap/0.9');

            // URL'leri XML'e ekle
            allUrls.forEach(url => {
                const urlElement = xml.ele('url');
                urlElement.ele('loc', `${this.siteUrl}${url.url}`);
                if (url.lastmod) {
                    urlElement.ele('lastmod', this.formatDate(url.lastmod));
                }
                urlElement.ele('changefreq', url.changefreq);
                urlElement.ele('priority', url.priority);
            });

            // XML header'ını ayarla ve response'u gönder
            res.header('Content-Type', 'application/xml');
            res.send(xml.end({ pretty: true }));

        } catch (error) {
            console.error('Sitemap oluşturma hatası:', error);
            res.status(500).json({
                success: false,
                message: 'Sitemap oluşturulurken bir hata oluştu',
                error: error.message
            });
        }
    }

    buildCategoryPath(category) {
        if (!category.ancestors) return category.slug;
        const ancestorSlugs = category.ancestors.map(a => a.slug);
        return [...ancestorSlugs, category.slug].join('/');
    }

    formatDate(date) {
        return new Date(date).toISOString().split('T')[0];
    }
}

export default new SitemapController(); 
