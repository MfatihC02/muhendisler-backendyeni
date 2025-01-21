import mongoose from 'mongoose';
import { uploadToCloudinary, deleteFromCloudinary } from '../utils/imageUtils.js';
import { createSlug, generateSKU } from '../utils/productUtils.js';
import { EVENTS } from '../socket/events/index.js';
import { getIO } from '../socket/index.js';
import express from 'express';
import cloudinary from '../config/cloudinary.js';

const Product = mongoose.model('Product');

// Ürün oluşturma
export const createProduct = async (req, res) => {
    try {
        console.log('Backend - Gelen request body:', req.body);
        console.log('Backend - Gelen file:', req.file);

        // Request body validasyonu
        if (!req.body || typeof req.body !== 'object') {
            throw new Error('Geçersiz istek verisi');
        }

        let {
            name,
            category,
            productType,
            brand,
            specifications,
            price,
            stock,
            status,
            description
        } = req.body;

        // Price işleme
        try {
            if (typeof price === 'string') {
                price = JSON.parse(price);
            }

            price = {
                current: parseFloat(price.current),
                discount: parseFloat(price.discount || 0),
                discountEndDate: price.discountEndDate || null
            };

            if (isNaN(price.current) || price.current <= 0) {
                throw new Error('Geçersiz fiyat değeri');
            }
        } catch (error) {
            throw new Error('Fiyat verisi işlenirken hata: ' + error.message);
        }

        // Stock işleme
        try {
            if (typeof stock === 'string') {
                stock = JSON.parse(stock);
            }

            stock = {
                quantity: parseInt(stock.quantity),
                unit: stock.unit || 'adet',
                lowStockAlert: parseInt(stock.lowStockAlert || 0)
            };
        } catch (error) {
            throw new Error('Stok verisi işlenirken hata: ' + error.message);
        }

        // Description işleme
        try {
            if (typeof description === 'string') {
                description = JSON.parse(description);
            }

            // Description validasyonu
            if (!description || !description.meta || !description.detailed || !Array.isArray(description.keywords)) {
                throw new Error('Geçersiz açıklama verisi');
            }

            description = {
                meta: description.meta.trim(),
                detailed: description.detailed.trim(),
                keywords: description.keywords.map(keyword => keyword.trim())
            };

            // Keywords validasyonu
            if (description.keywords.length < 3 || description.keywords.length > 10) {
                throw new Error('En az 3, en fazla 10 anahtar kelime girilmelidir');
            }
        } catch (error) {
            throw new Error('Açıklama verisi işlenirken hata: ' + error.message);
        }

        // Specifications işleme
        try {
            if (typeof specifications === 'string') {
                specifications = JSON.parse(specifications);
            }
        } catch (error) {
            throw new Error('Özellikler verisi işlenirken hata: ' + error.message);
        }

        // Zorunlu alan kontrolü
        if (!name || !category || !productType) {
            throw new Error('Ürün adı, kategori ve ürün tipi zorunludur');
        }

        // SKU ve Slug oluştur
        const sku = await generateSKU(productType);
        const slug = await createSlug(name.trim());

        // Resim yükleme işlemi
        let imageData = null;
        if (req.file) {
            try {
                const result = await uploadToCloudinary(req.file);
                imageData = {
                    url: result.secure_url,
                    publicId: result.public_id,
                    alt: `${name.trim()}-1`,
                    order: 1
                };
            } catch (uploadError) {
                console.error('Resim yükleme hatası:', uploadError);
                throw new Error('Resim yükleme başarısız: ' + uploadError.message);
            }
        }

        // Yeni ürün oluştur
        const product = new Product({
            name: name.trim(),
            slug,
            sku,
            category,
            productType,
            brand: brand || null,
            specifications,
            price,
            stock,
            description,
            images: imageData ? [imageData] : [],
            status: status || 'draft'
        });

        // Ürünü kaydet
        await product.save();

        // Socket.io ile bildirim gönder
        const io = getIO();
        io.emit(EVENTS.PRODUCT.CREATED, product);

        res.status(201).json({
            success: true,
            message: 'Ürün başarıyla oluşturuldu',
            data: product
        });

    } catch (error) {
        console.error('Backend - Ürün oluşturma hatası:', error);
        res.status(500).json({
            success: false,
            message: 'Ürün oluşturulurken bir hata oluştu',
            error: error.message
        });
    }
};

// Tüm ürünleri getirme (Filtreleme ve Arama ile)
export const getProducts = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            sort = '-createdAt',
            category,
            productType,
            brand,
            minPrice,
            maxPrice,
            status,
            search
        } = req.query;

        const query = {};

        // Arama filtresi
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { brand: { $regex: search, $options: 'i' } }
            ];
        }

        // Diğer filtreler
        if (category) query.category = category;
        if (productType) query.productType = productType;
        if (brand) query.brand = brand;
        if (status) query.status = status;

        // Fiyat aralığı filtresi
        if (minPrice || maxPrice) {
            query['price.current'] = {};
            if (minPrice) query['price.current'].$gte = Number(minPrice);
            if (maxPrice) query['price.current'].$lte = Number(maxPrice);
        }

        const options = {
            page: parseInt(page, 10),
            limit: parseInt(limit, 10),
            sort,
            populate: 'category',
            lean: true // Performans optimizasyonu
        };

        const products = await Product.paginate(query, options);

        res.status(200).json({
            success: true,
            message: 'Ürünler başarıyla getirildi',
            data: products
        });
    } catch (error) {
        console.error('Ürün listeleme hatası:', error);
        res.status(500).json({
            success: false,
            message: 'Ürünler listelenirken bir hata oluştu',
            error: error.message
        });
    }
};

// Tek ürün getirme
export const getProduct = async (req, res) => {
    try {
        const product = await Product.findOne({
            $or: [
                { _id: mongoose.isValidObjectId(req.params.id) ? req.params.id : null },
                { slug: req.params.id }
            ]
        }).populate('category');

        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Ürün bulunamadı'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Ürün başarıyla getirildi',
            data: product
        });
    } catch (error) {
        console.error('Ürün getirme hatası:', error);
        res.status(500).json({
            success: false,
            message: 'Ürün getirilirken bir hata oluştu',
            error: error.message
        });
    }
};
//slug ile ürün getirme
export const getProductBySlug = async (req, res) => {
    try {
        // Slug ile ürünü bul
        const product = await Product.findOne({ slug: req.params.slug }).populate('category');

        // Ürün bulunamazsa hata mesajı dön
        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Ürün bulunamadı'
            });
        }

        // Başarılı durumda ürünü döndür
        res.status(200).json({
            success: true,
            message: 'Ürün başarıyla getirildi',
            data: product
        });
    } catch (error) {
        // Hata durumunda logla ve hata mesajı gönder
        console.error('Ürün getirme hatası (slug ile):', error);
        res.status(500).json({
            success: false,
            message: 'Ürün getirilirken bir hata oluştu',
            error: error.message
        });
    }
};

// Ürün güncelleme
export const updateProduct = async (req, res) => {
    try {
        console.log('Update başlangıcı - Gelen veri:', req.body);
        
        const product = await Product.findById(req.params.id);
        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Ürün bulunamadı'
            });
        }

        // Price verisini parse et ve doğrula
        if (req.body.price) {
            try {
                const price = typeof req.body.price === 'string' 
                    ? JSON.parse(req.body.price) 
                    : req.body.price;
                
                req.body.price = {
                    current: parseFloat(price.current),
                    discount: parseFloat(price.discount || 0),
                    discountEndDate: price.discountEndDate || null
                };

                console.log('Parse edilmiş price verisi:', req.body.price);

                if (isNaN(req.body.price.current) || req.body.price.current <= 0) {
                    throw new Error('Geçersiz fiyat değeri');
                }
            } catch (error) {
                throw new Error('Fiyat verisi işlenirken hata: ' + error.message);
            }
        }

        // Stock verisini parse et
        if (req.body.stock) {
            try {
                const stock = typeof req.body.stock === 'string'
                    ? JSON.parse(req.body.stock)
                    : req.body.stock;

                req.body.stock = {
                    quantity: parseInt(stock.quantity),
                    unit: stock.unit || 'adet',
                    lowStockAlert: parseInt(stock.lowStockAlert || 0)
                };

                console.log('Parse edilmiş stock verisi:', req.body.stock);
            } catch (error) {
                throw new Error('Stok verisi işlenirken hata: ' + error.message);
            }
        }

        // Specifications verisini parse et
        if (req.body.specifications) {
            try {
                req.body.specifications = typeof req.body.specifications === 'string'
                    ? JSON.parse(req.body.specifications)
                    : req.body.specifications;

                console.log('Parse edilmiş specifications verisi:', req.body.specifications);
            } catch (error) {
                throw new Error('Özellikler verisi işlenirken hata: ' + error.message);
            }
        }

        // İsim değişmişse yeni slug oluştur
        if (req.body.name && req.body.name !== product.name) {
            req.body.slug = await createSlug(req.body.name);
        }

        // Resim yükleme işlemi
        if (req.files && req.files.length > 0) {
            const uploadPromises = req.files.map(async (file, index) => {
                const result = await uploadToCloudinary(file);
                return {
                    url: result.secure_url,
                    publicId: result.public_id,
                    alt: `${req.body.name || product.name}-${product.images.length + index + 1}`,
                    order: product.images.length + index + 1
                };
            });
            const newImages = await Promise.all(uploadPromises);
            req.body.images = [...(product.images || []), ...newImages];
        }

        console.log('Güncellenecek veriler:', req.body);

        const updatedProduct = await Product.findByIdAndUpdate(
            req.params.id,
            { $set: req.body },
            { new: true, runValidators: true }
        );

        console.log('Güncellenmiş ürün:', updatedProduct);

        // Ürün güncelleme olayını yayınla
        const io = getIO();
        io.emit(EVENTS.PRODUCT.UPDATED, { productId: updatedProduct._id, updates: req.body });

        res.status(200).json({
            success: true,
            message: 'Ürün başarıyla güncellendi',
            data: updatedProduct
        });
    } catch (error) {
        console.error('Ürün güncelleme hatası:', error);
        res.status(500).json({
            success: false,
            message: 'Ürün güncellenirken bir hata oluştu',
            error: error.message
        });
    }
};

// Ürün silme
export const deleteProduct = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);

        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Ürün bulunamadı'
            });
        }

        // Resimleri Cloudinary'den sil
        if (product.images && product.images.length > 0) {
            const deletePromises = product.images.map(image =>
                deleteFromCloudinary(image.publicId)
            );
            await Promise.all(deletePromises);
        }

        await Product.findByIdAndDelete(req.params.id);

        // Ürün silme olayını yayınla
        const io = getIO();
        io.emit(EVENTS.PRODUCT.DELETED, { productId: product._id });

        res.status(200).json({
            success: true,
            message: 'Ürün başarıyla silindi'
        });
    } catch (error) {
        console.error('Ürün silme hatası:', error);
        res.status(500).json({
            success: false,
            message: 'Ürün silinirken bir hata oluştu',
            error: error.message
        });
    }
};

// Ürün resmi silme
export const deleteProductImage = async (req, res) => {
    try {
        const { id, imageId } = req.params;
        const product = await Product.findById(id);

        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Ürün bulunamadı'
            });
        }

        const imageIndex = product.images.findIndex(img => img._id.toString() === imageId);

        if (imageIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'Resim bulunamadı'
            });
        }

        // Cloudinary'den resmi sil
        await deleteFromCloudinary(product.images[imageIndex].publicId);

        // Ürünün images dizisinden resmi kaldır
        product.images.splice(imageIndex, 1);

        // Kalan resimlerin sırasını güncelle
        product.images = product.images.map((img, index) => ({
            ...img,
            order: index + 1
        }));

        await product.save();

        // Ürün resmi silme olayını yayınla
        const io = getIO();
        io.emit(EVENTS.PRODUCT.IMAGE_DELETED, { productId: product._id, imageId: imageId });

        res.status(200).json({
            success: true,
            message: 'Ürün resmi başarıyla silindi',
            data: product
        });
    } catch (error) {
        console.error('Ürün resmi silme hatası:', error);
        res.status(500).json({
            success: false,
            message: 'Ürün resmi silinirken bir hata oluştu',
            error: error.message
        });
    }
};

// Ürün resmi sıralama güncelleme
export const updateImageOrder = async (req, res) => {
    try {
        const { id } = req.params;
        const { imageOrders } = req.body; // [{ imageId: '...', order: 1 }, ...]

        const product = await Product.findById(id);

        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Ürün bulunamadı'
            });
        }

        // Resimlerin sırasını güncelle
        imageOrders.forEach(orderItem => {
            const image = product.images.find(img => img._id.toString() === orderItem.imageId);
            if (image) {
                image.order = orderItem.order;
            }
        });

        // Resimleri sıraya göre tekrar düzenle
        product.images.sort((a, b) => a.order - b.order);

        await product.save();

        // Ürün resim sıralaması güncelleme olayını yayınla
        const io = getIO();
        io.emit(EVENTS.PRODUCT.IMAGE_ORDER_UPDATED, { productId: product._id, imageOrders: product.images });

        res.status(200).json({
            success: true,
            message: 'Resim sıralaması başarıyla güncellendi',
            data: product
        });
    } catch (error) {
        console.error('Resim sıralama güncelleme hatası:', error);
        res.status(500).json({
            success: false,
            message: 'Resim sıralaması güncellenirken bir hata oluştu',
            error: error.message
        });
    }
};
