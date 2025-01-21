// controllers/order.controller.js
import mongoose from 'mongoose';
import { Order } from '../models/order.model.js';
import { User } from '../models/user.model.js';
import NodeCache from 'node-cache';
import {Address} from '../models/address.model.js';
import StockReservation from '../models/stockReservation.model.js';

const Product = mongoose.model('Product');

// Cache instance
const orderCache = new NodeCache({ stdTTL: 600 }); // 10 dakika

const OrderController = {
    async createOrder(req, res) {
        try {
            const { items, shippingAddressId } = req.body;
            const userId = req.user._id;

            // Adres bilgisini al
            const shippingAddress = await Address.findOne({
                _id: shippingAddressId,
                user: userId
            }).lean();

            if (!shippingAddress) {
                throw new Error('Teslimat adresi bulunamadı');
            }

            // Ürünleri kontrol et ve toplam tutarı hesapla
            let totalAmount = 0;
            const orderItems = [];

            for (const item of items) {
                const product = await Product.findById(item.productId).lean();
                if (!product) {
                    throw new Error(`Ürün bulunamadı: ${item.productId}`);
                }

                // Rezervasyonu kontrol et ve güncelle
                const reservation = await StockReservation.findOne({
                    _id: item.reservationId,
                    product: item.productId,
                    user: userId,
                    status: { $in: ['CART', 'CHECKOUT'] }
                });

                if (!reservation) {
                    throw new Error(`Geçersiz rezervasyon: ${item.reservationId}`);
                }

                // Fiyat hesaplama
                let finalPrice = product.price.current;
                
                // İndirim kontrolü
                if (product.price.discount > 0 && product.price.discountEndDate && new Date(product.price.discountEndDate) > new Date()) {
                    finalPrice = product.price.current - product.price.discount;
                }

                // Rezervasyonu onayla
                await reservation.confirm();

                orderItems.push({
                    product: item.productId,
                    quantity: item.quantity,
                    price: finalPrice,
                    name: product.name,
                    unit: item.unit,
                    stockReservationId: item.reservationId,
                    originalPrice: product.price.current,
                    discount: product.price.discount > 0 ? product.price.discount : 0
                });

                totalAmount += finalPrice * item.quantity;
            }

            // Sipariş oluştur
            const order = new Order({
                user: userId,
                items: orderItems,
                totalAmount: Number(totalAmount.toFixed(2)),
                shippingAddress,
                status: 'CREATED',
                paymentStatus: 'PENDING'
            });

            await order.save();

            // Cache'i temizle
            orderCache.del(`orders:${userId}`);

            return res.status(201).json({
                success: true,
                data: order
            });

        } catch (error) {
            console.error('Sipariş oluşturma hatası:', error);
            
            // MongoDB duplicate key hatası kontrolü
            if (error.code === 11000 && error.keyPattern && error.keyPattern.orderNumber) {
                try {
                    // Yeni bir order instance oluştur
                    const tempOrder = new Order();
                    // Pre-save middleware'i tetikleyerek yeni sipariş numarası al
                    await tempOrder.save();
                    const newOrderNumber = tempOrder.orderNumber;
                    
                    // Geçici order'ı sil
                    await Order.deleteOne({ _id: tempOrder._id });
                    
                    // Yeni sipariş numarası ile tekrar dene
                    req.body.orderNumber = newOrderNumber;
                    return await OrderController.createOrder.call(OrderController, req, res);
                } catch (retryError) {
                    console.error('Sipariş numarası yeniden oluşturma hatası:', retryError);
                    return res.status(500).json({
                        success: false,
                        error: 'Sipariş oluşturulamadı. Lütfen tekrar deneyiniz.'
                    });
                }
            }

            return res.status(400).json({
                success: false,
                error: error.message
            });
        }
    },

    async getOrder(req, res) {
        try {
            const orderId = req.params.id;
            const order = await Order.findById(orderId)
                .populate('user', 'email')
                .populate('shippingAddress')
                .populate('items.product')
                .lean();

            if (!order) {
                return res.status(404).json({
                    success: false,
                    message: 'Sipariş bulunamadı'
                });
            }

            res.json({
                success: true,
                data: order
            });

        } catch (error) {
            console.error('Sipariş getirme hatası:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    },

    async getUserOrders(req, res) {
        try {
            const userId = req.user.id;
            const { page = 1, limit = 10, status } = req.query;

            const query = { user: userId };
            if (status) {
                query.status = status;
            }

            const orders = await Order.find(query)
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(parseInt(limit))
                .populate('items.product', 'name price')
                .lean();

            const total = await Order.countDocuments(query);

            res.json({
                success: true,
                data: {
                    orders,
                    total,
                    pages: Math.ceil(total / limit),
                    currentPage: parseInt(page)
                }
            });

        } catch (error) {
            console.error('Kullanıcı siparişleri getirme hatası:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    },

    async updateOrderStatus(req, res) {
        try {
            const { orderId } = req.params;
            const { status, note } = req.body;

            const order = await Order.findById(orderId);
            if (!order) {
                return res.status(404).json({
                    success: false,
                    error: 'Sipariş bulunamadı'
                });
            }

            // Durumu güncelle
            order.status = status;
            
            // Durum geçmişine ekle
            order.statusHistory.push({
                status,
                timestamp: new Date(),
                note: note || ''
            });

            await order.save();

            return res.json({
                success: true,
                message: 'Sipariş durumu güncellendi',
                order
            });

        } catch (error) {
            console.error('Sipariş durumu güncelleme hatası:', error);
            return res.status(500).json({
                success: false,
                error: 'Sipariş durumu güncellenirken bir hata oluştu'
            });
        }
    },

    async cancelOrder(req, res) {
        try {
            const { id } = req.params;
            const userId = req.user.id;

            const order = await Order.findOne({ _id: id, user: userId });

            if (!order) {
                return res.status(404).json({
                    success: false,
                    error: 'Sipariş bulunamadı'
                });
            }

            if (!order.canTransitionTo('CANCELLED')) {
                return res.status(400).json({
                    success: false,
                    error: 'Sipariş artık iptal edilemez'
                });
            }

            // Stokları geri yükle
            for (const item of order.items) {
                await Product.findByIdAndUpdate(
                    item.product,
                    { $inc: { stock: item.quantity } }
                );
            }

            order.status = 'CANCELLED';
            order.addStatusHistory('CANCELLED', 'Müşteri tarafından iptal edildi');
            await order.save();

            // Cache'i temizle
            orderCache.del(`order_${id}`);

            // WebSocket bildirimi
            const io = req.app.get('io');
            io.emit('orderCancelled', { orderId: id });

            res.json({
                success: true,
                data: order
            });

        } catch (error) {
            console.error('Sipariş iptal hatası:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    },

    // Admin metodları
    async getAllOrders(req, res) {
        try {
            const {
                page = 1,
                limit = 10,
                status,
                startDate,
                endDate,
                sortBy = 'createdAt',
                sortOrder = 'desc'
            } = req.query;

            const query = {};

            if (status) {
                query.status = status;
            }

            if (startDate && endDate) {
                query.createdAt = {
                    $gte: new Date(startDate),
                    $lte: new Date(endDate)
                };
            }

            const sortOptions = {};
            sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

            const orders = await Order.find(query)
                .sort(sortOptions)
                .skip((page - 1) * limit)
                .limit(parseInt(limit))
                .populate('user', 'name email')
                .populate('items.product', 'name price')
                .lean();

            const total = await Order.countDocuments(query);

            res.json({
                success: true,
                data: {
                    orders,
                    total,
                    pages: Math.ceil(total / limit),
                    currentPage: parseInt(page)
                }
            });

        } catch (error) {
            console.error('Admin siparişleri getirme hatası:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    },

    async adminUpdateOrderStatus(req, res) {
        try {
            const { orderId } = req.params;
            const { status, note } = req.body;

            const order = await Order.findById(orderId);

            if (!order) {
                return res.status(404).json({
                    success: false,
                    error: 'Sipariş bulunamadı'
                });
            }

            if (!order.canTransitionTo(status)) {
                return res.status(400).json({
                    success: false,
                    error: 'Geçersiz durum geçişi'
                });
            }

            order.status = status;
            order.addStatusHistory(status, note);
            await order.save();

            // Cache'i temizle
            orderCache.del(`order_${orderId}`);

            // WebSocket bildirimi
            const io = req.app.get('io');
            io.emit('adminOrderStatusUpdated', {
                orderId,
                status,
                note
            });

            res.json({
                success: true,
                data: order
            });

        } catch (error) {
            console.error('Admin sipariş durumu güncelleme hatası:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    },

    async getOrderStats(req, res) {
        try {
            const { startDate, endDate } = req.query;

            const dateQuery = {};
            if (startDate && endDate) {
                dateQuery.createdAt = {
                    $gte: new Date(startDate),
                    $lte: new Date(endDate)
                };
            }

            const stats = await Order.aggregate([
                { $match: dateQuery },
                {
                    $group: {
                        _id: '$status',
                        count: { $sum: 1 },
                        totalAmount: { $sum: '$totalAmount' }
                    }
                }
            ]);

            const totalOrders = await Order.countDocuments(dateQuery);
            const totalRevenue = await Order.aggregate([
                { $match: dateQuery },
                {
                    $group: {
                        _id: null,
                        total: { $sum: '$totalAmount' }
                    }
                }
            ]);

            res.json({
                success: true,
                data: {
                    statusBreakdown: stats,
                    totalOrders,
                    totalRevenue: totalRevenue[0]?.total || 0
                }
            });

        } catch (error) {
            console.error('Sipariş istatistikleri hatası:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    },

    async adminUpdateOrder(req, res) {
        try {
            const { orderId } = req.params;
            const updates = req.body;

            // Güvenli güncelleme için izin verilen alanlar
            const allowedUpdates = ['shippingDetails', 'notes'];
            const updateData = {};

            Object.keys(updates).forEach(key => {
                if (allowedUpdates.includes(key)) {
                    updateData[key] = updates[key];
                }
            });

            const order = await Order.findByIdAndUpdate(
                orderId,
                { $set: updateData },
                { new: true, runValidators: true }
            );

            if (!order) {
                return res.status(404).json({
                    success: false,
                    error: 'Sipariş bulunamadı'
                });
            }

            // Cache'i temizle
            orderCache.del(`order_${orderId}`);

            // WebSocket bildirimi
            const io = req.app.get('io');
            io.emit('orderUpdated', {
                orderId,
                updates: updateData
            });

            res.json({
                success: true,
                data: order
            });

        } catch (error) {
            console.error('Admin sipariş güncelleme hatası:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
};

export default OrderController;