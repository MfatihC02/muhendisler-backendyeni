import mongoose from 'mongoose';
import { Category } from '../models/category.model.js';
import slugify from 'slugify';
import { getIO } from '../socket/index.js';
import { EVENTS } from '../socket/events/index.js';
import { uploadToCloudinary, deleteFromCloudinary } from '../utils/imageUtils.js';

const Product = mongoose.model('Product');

export class CategoryController {
    static prepareSocketData(category) {
        return {
            _id: category._id,
            name: category.name,
            slug: category.slug,
            description: category.description,
            parent: category.parent,
            level: category.level,
            order: category.order,
            isActive: category.isActive,
            metadata: category.metadata,
            image: category.image,
            productCount: category.productCount,
            subCategoryCount: category.subCategoryCount
        };
    }
    //slug ile ürün getirme  
    static async getProductsByCategory(req, res) {
        try {
            const category = await Category.findOne({
                slug: req.params.slug
            });

            if (!category) {
                return res.status(404).json({
                    success: false,
                    message: 'Kategori bulunamadı'
                });
            }

            // Tüm olası sorgu yöntemleri
            const products1 = await Product.find({ category: category._id });
            const products2 = await Product.find({ 'category._id': category._id });
            const products3 = await Product.find({ category: { $eq: category._id } });

            console.log('Yöntem 1 Ürün Sayısı:', products1.length);
            console.log('Yöntem 2 Ürün Sayısı:', products2.length);
            console.log('Yöntem 3 Ürün Sayısı:', products3.length);

            return res.status(200).json({
                success: true,
                data: products1,
                pagination: {
                    total: products1.length,
                    page: 1,
                    pages: 1
                }
            });
        } catch (error) {
            console.error('Detaylı Hata:', error);
            return res.status(500).json({
                success: false,
                message: 'Ürünler getirilemedi',
                error: error.message
            });
        }
    }

    // Tüm kategorileri getir
    static async getAllCategories(req, res) {
        try {
            const { page = 1, limit = 10, sort = 'order', parent = null } = req.query;
            const options = {
                page: parseInt(page),
                limit: parseInt(limit),
                sort: { [sort]: 1 },
                select: '-ancestors'
            };

            const query = parent === 'null' ? { parent: null } : parent ? { parent } : {};

            const categories = await Category.paginate(query, options);

            return res.status(200).json({
                success: true,
                data: categories.docs,
                pagination: {
                    total: categories.totalDocs,
                    page: categories.page,
                    pages: categories.totalPages
                }
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                message: 'Kategoriler listelenirken bir hata oluştu',
                error: error.message
            });
        }
    }

    // Kategori detayı getir
    static async getCategoryById(req, res) {
        try {
            const category = await Category.findById(req.params.id)
                .populate('parent', 'name slug');

            if (!category) {
                return res.status(404).json({
                    success: false,
                    message: 'Kategori bulunamadı'
                });
            }

            return res.status(200).json({
                success: true,
                data: category
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                message: 'Kategori getirilirken bir hata oluştu',
                error: error.message
            });
        }
    }

    // Yeni kategori oluştur
    static async createCategory(req, res) {
        try {
            const { name, parent, description, order, metadata, isActive } = req.body;
            let slug = slugify(name, { lower: true, strict: true, locale: 'tr' });

            // Slug benzersizlik kontrolü
            const slugExists = await Category.exists({ slug });
            if (slugExists) {
                slug = `${slug}-${Date.now()}`;
            }

            let ancestors = [];
            let level = 0;

            // Eğer parent kategori varsa, ancestors ve level hesapla
            if (parent) {
                const parentCategory = await Category.findById(parent);
                if (!parentCategory) {
                    return res.status(404).json({
                        success: false,
                        message: 'Üst kategori bulunamadı'
                    });
                }
                ancestors = [...parentCategory.ancestors, {
                    _id: parentCategory._id,
                    name: parentCategory.name,
                    slug: parentCategory.slug
                }];
                level = parentCategory.level + 1;

                // Parent kategorinin alt kategori sayısını güncelle
                await Category.findByIdAndUpdate(parent, {
                    $inc: { subCategoryCount: 1 }
                });
            }

            // Yeni kategori oluştur
            const category = new Category({
                name,
                slug,
                description,
                parent,
                ancestors,
                level,
                order: order || 0,
                isActive: isActive ?? true,
                metadata
            });

            if (req.file) {
                category.image = req.file.path;
            }

            await category.save();

            // Socket.IO ile bildirim gönder - Store beklentisine uygun formatta
            try {
                const io = getIO();
                io.emit(EVENTS.CATEGORY.CREATED, {
                    category: CategoryController.prepareSocketData(category)  // Sınıf adı ile çağırma
                });
            } catch (error) {
                // Socket hatası kategori güncellemeyi etkilemesin
                console.warn('Socket notification failed:', error.message);
            }

            return res.status(201).json({
                success: true,
                message: 'Kategori başarıyla oluşturuldu',
                data: category
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                message: 'Kategori oluşturulurken bir hata oluştu',
                error: error.message
            });
        }
    }

    // Kategori güncelle
    static async updateCategory(req, res) {
        try {
            console.log('Kategori güncelleme başladı:', {
                id: req.params.id,
                body: req.body,
                file: req.file ? {
                    originalname: req.file.originalname,
                    size: req.file.size,
                    mimetype: req.file.mimetype
                } : 'Resim yok'
            });

            const { id } = req.params;
            const { name, parent, description, order, metadata, isActive } = req.body;

            const category = await Category.findById(id);
            if (!category) {
                console.log('Kategori bulunamadı:', id);
                return res.status(404).json({
                    success: false,
                    message: 'Kategori bulunamadı'
                });
            }

            console.log('Mevcut kategori bilgileri:', {
                id: category._id,
                name: category.name,
                parent: category.parent,
                image: category.image
            });

            const originalParent = category.parent?.toString();
            let parentChanged = false;
            const updates = {};

            // Eğer isim değiştiyse yeni slug oluştur
            if (name && name !== category.name) {
                const slug = slugify(name, { lower: true, strict: true, locale: 'tr' });
                const slugExists = await Category.exists({ slug, _id: { $ne: id } });
                updates.slug = slugExists ? `${slug}-${Date.now()}` : slug;
                updates.name = name;
                category.name = name;
                category.slug = updates.slug;
                console.log('İsim güncellendi:', { yeniIsim: name, yeniSlug: updates.slug });
            }

            // Parent değiştiyse ancestors ve level güncelle
            if (parent && parent !== originalParent) {
                parentChanged = true;
                console.log('Parent değişikliği:', { eskiParent: originalParent, yeniParent: parent });
                
                const parentId = new mongoose.Types.ObjectId(parent);
                const parentCategory = await Category.findById(parentId);
                
                if (!parentCategory) {
                    console.log('Üst kategori bulunamadı:', parent);
                    return res.status(404).json({
                        success: false,
                        message: 'Üst kategori bulunamadı'
                    });
                }

                // Döngüsel parent kontrolü
                if (parentCategory.ancestors.some(a => a._id.toString() === id)) {
                    console.log('Döngüsel parent hatası:', {
                        kategoriId: id,
                        parentId: parent,
                        ancestors: parentCategory.ancestors
                    });
                    return res.status(400).json({
                        success: false,
                        message: 'Döngüsel kategori ilişkisi oluşturulamaz'
                    });
                }

                // Eski parent'ın subCategoryCount'unu azalt
                if (originalParent) {
                    await Category.findByIdAndUpdate(originalParent, {
                        $inc: { subCategoryCount: -1 }
                    });
                    console.log('Eski parent subCategoryCount azaltıldı:', originalParent);
                }

                // Yeni parent'ın subCategoryCount'unu artır
                await Category.findByIdAndUpdate(parentId, {
                    $inc: { subCategoryCount: 1 }
                });
                console.log('Yeni parent subCategoryCount artırıldı:', parentId);

                const newAncestors = [...parentCategory.ancestors, {
                    _id: parentCategory._id,
                    name: parentCategory.name,
                    slug: parentCategory.slug
                }];

                updates.parent = parentId;
                updates.ancestors = newAncestors;
                updates.level = parentCategory.level + 1;

                category.parent = parentId;
                category.ancestors = newAncestors;
                category.level = updates.level;
            }

            // Metadata'yı parse et ve güncelle
            if (metadata) {
                try {
                    const parsedMetadata = typeof metadata === 'string' ? JSON.parse(metadata) : metadata;
                    updates.metadata = parsedMetadata;
                    category.metadata = parsedMetadata;
                    console.log('Metadata güncellendi:', parsedMetadata);
                } catch (error) {
                    console.error('Metadata parse hatası:', error);
                    return res.status(400).json({
                        success: false,
                        message: 'Metadata formatı geçersiz',
                        error: error.message
                    });
                }
            }

            // Diğer alanları güncelle
            if (description !== undefined) {
                updates.description = description;
                category.description = description;
                console.log('Açıklama güncellendi:', description);
            }
            if (order !== undefined) {
                updates.order = order;
                category.order = order;
                console.log('Sıra güncellendi:', order);
            }
            if (isActive !== undefined) {
                updates.isActive = isActive;
                category.isActive = isActive;
                console.log('Aktiflik durumu güncellendi:', isActive);
            }

            // Resim güncelleme
            if (req.file) {
                try {
                    const result = await uploadToCloudinary(req.file);
                    updates.image = result.secure_url;
                    category.image = result.secure_url;
                    console.log('Resim Cloudinary\'ye yüklendi:', {
                        url: result.secure_url,
                        publicId: result.public_id
                    });
                } catch (error) {
                    console.error('Resim yükleme hatası:', error);
                    return res.status(500).json({
                        success: false,
                        message: 'Resim yüklenirken bir hata oluştu',
                        error: error.message
                    });
                }
            }

            await category.save();
            console.log('Kategori kaydedildi:', category._id);

            // Alt kategorilerin ancestors ve level bilgilerini güncelle
            if (name || parentChanged) {
                await Category.updateMany(
                    { 'ancestors._id': category._id },
                    {
                        $set: {
                            'ancestors.$.name': category.name,
                            'ancestors.$.slug': category.slug
                        }
                    }
                );
                console.log('Alt kategoriler güncellendi');
            }

            // Socket.IO bildirimi
            try {
                const io = getIO();
                io.emit(EVENTS.CATEGORY.UPDATED, {
                    categoryId: category._id,
                    updates: CategoryController.prepareSocketData(category)
                });
                console.log('Socket bildirimi gönderildi: CATEGORY.UPDATED');

                if (parentChanged) {
                    io.emit(EVENTS.CATEGORY.TREE_UPDATED);
                    console.log('Socket bildirimi gönderildi: CATEGORY.TREE_UPDATED');
                }
            } catch (error) {
                console.warn('Socket bildirimi başarısız:', error.message);
            }

            console.log('Kategori güncelleme tamamlandı');
            return res.status(200).json({
                success: true,
                message: 'Kategori başarıyla güncellendi',
                data: category
            });
        } catch (error) {
            console.error('Kategori güncelleme hatası:', error);
            return res.status(500).json({
                success: false,
                message: 'Kategori güncellenirken bir hata oluştu',
                error: error.message
            });
        }
    }

    // Kategori sil
    static async deleteCategory(req, res) {
        try {
            const { id } = req.params;

            // Kategoriyi bul
            const category = await Category.findById(id);
            if (!category) {
                return res.status(404).json({
                    success: false,
                    message: 'Kategori bulunamadı'
                });
            }

            // Alt kategori kontrolü
            if (category.subCategoryCount > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Alt kategorisi olan bir kategori silinemez'
                });
            }

            // Ürün kontrolü
            if (category.productCount > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Ürünü olan bir kategori silinemez'
                });
            }

            const parentId = category.parent;

            // Parent kategorinin alt kategori sayısını azalt
            if (parentId) {
                await Category.findByIdAndUpdate(parentId, {
                    $inc: { subCategoryCount: -1 }
                });
            }

            // remove() yerine deleteOne() kullanımı
            await Category.deleteOne({ _id: id });

            // Socket.IO ile bildirim gönder
            try {
                const io = getIO();
                io.emit(EVENTS.CATEGORY.DELETED, {
                    categoryId: id,
                    parentId: parentId
                });
            } catch (error) {
                // Socket hatası kategori silmeyi etkilemesin
                console.warn('Socket notification failed:', error.message);
            }

            return res.status(200).json({
                success: true,
                message: 'Kategori başarıyla silindi'
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                message: 'Kategori silinirken bir hata oluştu',
                error: error.message
            });
        }
    }
    // Kategori ağacını getir
    static async getCategoryTree(req, res) {
        try {
            console.log('Kategori ağacı getirme işlemi başladı');

            const categories = await Category.find({})
                .select('name slug description image parent level order isActive subCategoryCount productCount metadata ancestors')
                .sort('order')
                .lean();

            console.log(`${categories.length} kategori bulundu`);

            const tree = CategoryController.buildTree(categories);
            console.log('Kategori ağacı oluşturuldu');

            return res.status(200).json({
                success: true,
                data: tree
            });
        } catch (error) {
            console.error('Kategori ağacı getirme hatası:', error);
            return res.status(500).json({
                success: false,
                message: 'Kategori ağacı oluşturulurken bir hata oluştu',
                error: error.message
            });
        }
    }

    static buildTree(items, parentId = null) {
        const tree = [];
        
        for (const item of items) {
            if ((parentId === null && !item.parent) || 
                (item.parent && item.parent.toString() === parentId?.toString())) {
                const node = {
                    _id: item._id,
                    name: item.name,
                    slug: item.slug,
                    description: item.description,
                    image: item.image,
                    level: item.level,
                    order: item.order,
                    isActive: item.isActive,
                    subCategoryCount: item.subCategoryCount,
                    productCount: item.productCount,
                    metadata: item.metadata || {}, // Metadata eklendi
                    ancestors: item.ancestors || [],
                    children: CategoryController.buildTree(items, item._id)
                };
                tree.push(node);
            }
        }
        
        // Sıralama: Önce order'a göre, sonra name'e göre
        return tree.sort((a, b) => {
            if (a.order !== b.order) {
                return a.order - b.order;
            }
            return a.name.localeCompare(b.name, 'tr');
        });
    }
    // Kategori durumunu güncelle
    static async updateCategoryStatus(req, res) {
        try {
            const { id } = req.params;
            const { isActive } = req.body;

            if (isActive === undefined) {
                return res.status(400).json({
                    success: false,
                    message: 'isActive alanı gereklidir'
                });
            }

            const category = await Category.findByIdAndUpdate(
                id,
                { isActive },
                { new: true }
            );

            if (!category) {
                return res.status(404).json({
                    success: false,
                    message: 'Kategori bulunamadı'
                });
            }

            // Socket.IO ile bildirim gönder - Store beklentisine uygun formatta
            try {
                const io = getIO();
                io.emit(EVENTS.CATEGORY.STATUS_CHANGED, {
                    categoryId: id,
                    isActive: category.isActive
                });
            } catch (error) {
                // Socket hatası kategori güncellemeyi etkilemesin
                console.warn('Socket notification failed:', error.message);
            }

            return res.status(200).json({
                success: true,
                message: 'Kategori durumu başarıyla güncellendi',
                data: category
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                message: 'Kategori durumu güncellenirken bir hata oluştu',
                error: error.message
            });
        }
    }
}