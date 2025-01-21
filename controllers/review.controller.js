import mongoose from 'mongoose';
import Review  from '../models/review.model.js';
import { Order } from '../models/order.model.js';

class ReviewController {
    // User Methods
    async createReview(req, res) {
        try {
            const userId = req.user._id;
            const { productId, rating, comment } = req.body;

            console.log('Gelen veriler:', {
                userId: userId.toString(),
                productId,
                rating,
                comment
            });

            // Kullanıcının bu ürün için yorum sayısını kontrol et
            const userReviewCount = await Review.countDocuments({ 
                userId, 
                productId 
            });
            
            console.log('Kullanıcının yorum sayısı:', userReviewCount);

            if (userReviewCount >= 3) {
                return res.status(400).json({
                    success: false,
                    message: 'Bu ürün için maksimum yorum sayısına (3) ulaştınız'
                });
            }

            // Satın alma kontrolü
            // MongoDB ObjectId'ye dönüştür
            const productObjectId = new mongoose.Types.ObjectId(productId);

            const order = await Order.findOne({
                user: userId,
                'items.product': productObjectId,
                'paymentDetails.status': 'COMPLETED'
            }).populate('items.product');

            console.log('Sipariş kontrolü:', {
                arananKullanici: userId.toString(),
                arananUrun: productId,
                bulunanSiparis: order ? 'Sipariş bulundu' : 'Sipariş bulunamadı',
                siparisDetaylari: order ? {
                    siparisId: order._id.toString(),
                    urunler: order.items.map(item => ({
                        urunId: item.product._id.toString(),
                        urunAdi: item.product.name,
                        miktar: item.quantity
                    })),
                    odemeDurumu: order.paymentDetails.status
                } : null
            });

            if (!order) {
                return res.status(403).json({
                    success: false,
                    message: 'Sadece satın aldığınız ürünlere yorum yapabilirsiniz'
                });
            }

            // Yeni yorumu oluştur
            const review = new Review({
                userId,
                productId,
                rating,
                comment,
                isVerifiedPurchase: true
            });

            await review.save();

            console.log('Yorum başarıyla oluşturuldu:', review);

            res.status(201).json({
                success: true,
                message: 'Yorum başarıyla oluşturuldu',
                data: review
            });

        } catch (error) {
            console.error('Yorum oluşturma hatası:', error);
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

    async updateReview(req, res) {
        try {
            const { id } = req.params;
            const { rating, comment } = req.body;
            const userId = req.user._id;

            const review = await Review.findOne({ _id: id, userId });
            if (!review) {
                return res.status(404).json({
                    success: false,
                    message: 'Yorum bulunamadı veya bu yorumu düzenleme yetkiniz yok'
                });
            }

            review.rating = rating;
            review.comment = comment;
            await review.save();

            res.json({
                success: true,
                data: review,
                message: 'Yorumunuz başarıyla güncellendi'
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

    async deleteReview(req, res) {
        try {
            const { id } = req.params;
            const userId = req.user._id;

            const review = await Review.findOneAndDelete({ _id: id, userId });
            if (!review) {
                return res.status(404).json({
                    success: false,
                    message: 'Yorum bulunamadı veya bu yorumu silme yetkiniz yok'
                });
            }

            res.json({
                success: true,
                message: 'Yorum başarıyla silindi'
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

    async getProductReviews(req, res) {
        try {
            const { productId } = req.params;
            const reviews = await Review.find({ productId })
                .populate('userId', 'username')
                .sort({ createdAt: -1 });

            res.json({
                success: true,
                data: reviews
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

    async getUserReviews(req, res) {
        try {
            const userId = req.user._id;
            const reviews = await Review.find({ userId })
                .populate('productId', 'name')
                .sort({ createdAt: -1 });

            res.json({
                success: true,
                data: reviews
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

    // Admin Methods
    async getAllReviews(req, res) {
        try {
            const reviews = await Review.find()
                .populate('userId', 'username')
                .populate('productId', 'name')
                .sort({ createdAt: -1 });

            res.json({
                success: true,
                data: reviews
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

    async deleteReviewAdmin(req, res) {
        try {
            const { id } = req.params;
            const review = await Review.findByIdAndDelete(id);
            
            if (!review) {
                return res.status(404).json({
                    success: false,
                    message: 'Yorum bulunamadı'
                });
            }

            res.json({
                success: true,
                message: 'Yorum başarıyla silindi'
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

    async updateReviewAdmin(req, res) {
        try {
            const { id } = req.params;
            const { rating, comment } = req.body;

            const review = await Review.findByIdAndUpdate(
                id,
                { rating, comment },
                { new: true }
            );

            if (!review) {
                return res.status(404).json({
                    success: false,
                    message: 'Yorum bulunamadı'
                });
            }

            res.json({
                success: true,
                data: review,
                message: 'Yorum başarıyla güncellendi'
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }
}

export default new ReviewController();
