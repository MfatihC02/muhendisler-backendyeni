// controllers/stock.controller.js
import mongoose from 'mongoose';
import NodeCache from 'node-cache';
import {Stock} from '../models/stock.model.js';
import StockReservation from '../models/stockReservation.model.js';
const Product = mongoose.model('Product');

// Stok işlemleri için cache
const stockCache = new NodeCache({ stdTTL: 300 }); // 5 dakika TTL

class StockController {
    // Stok oluşturma
    static async createStock(req, res) {
        try {
            console.log('Gelen istek:', req.body);
            console.log('Doğrulanmış stok:', req.validatedStock);

            // Ürünün varlığını kontrol et
            const product = await Product.findById(req.body.productId);
            
            if (!product) {
                console.error('Ürün bulunamadı:', req.body.productId);
                return res.status(404).json({
                    success: false,
                    message: 'Ürün bulunamadı',
                    productId: req.body.productId
                });
            }

            console.log('Ürün bulundu:', product);

            const stock = new Stock({
                ...req.validatedStock,
                product: req.body.productId,
                productType: product.productType
            });

            console.log('Oluşturulacak stok:', stock);

            await stock.save();
            stockCache.del(`stock_${req.body.productId}`);

            res.status(201).json({
                success: true,
                message: 'Stok başarıyla oluşturuldu',
                data: stock
            });
        } catch (error) {
            console.error('Stok oluşturma hatası:', error);
            res.status(400).json({
                success: false,
                message: 'Stok oluşturulurken hata oluştu',
                error: error.message,
                details: error.errors ? Object.keys(error.errors).reduce((acc, key) => {
                    acc[key] = error.errors[key].message;
                    return acc;
                }, {}) : null
            });
        }
    }

    // Stok bilgisi getirme
    static async getStock(req, res) {
        try {
            console.log('Stok bilgisi isteniyor:', req.params.id);

            const cachedStock = stockCache.get(`stock_${req.params.id}`);
            if (cachedStock) {
                console.log('Cache\'den stok bilgisi döndürülüyor');
                return res.json({
                    success: true,
                    data: cachedStock
                });
            }

            const stock = await Stock.findById(req.params.id)
                .populate({
                    path: 'product',
                    select: 'name productType specifications'
                })
                .lean();

            if (!stock) {
                console.log('Stok bulunamadı');
                return res.status(404).json({
                    success: false,
                    message: 'Stok bulunamadı'
                });
            }

            console.log('Stok bulundu:', stock);
            stockCache.set(`stock_${req.params.id}`, stock);
            
            res.json({
                success: true,
                data: stock
            });
        } catch (error) {
            console.error('Stok getirme hatası:', error);
            res.status(500).json({
                success: false,
                message: 'Stok bilgisi alınırken bir hata oluştu',
                error: error.message
            });
        }
    }

    // Ürün slug'ına göre stok bilgisi
    static async getStockByProductSlug(req, res) {
        try {
            // Önce slug'a göre ürünü bul
            const product = await mongoose.model('Product').findOne({ slug: req.params.slug });
            
            if (!product) {
                return res.status(404).json({ error: 'Ürün bulunamadı' });
            }

            // Ürünün ID'si ile stok bilgisini getir
            const stock = await Stock.getProductStock(product._id);
            
            if (!stock) {
                return res.status(404).json({ error: 'Stok bulunamadı' });
            }
            
            res.json(stock);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    // Ürüne göre stok bilgisi
    static async getStockByProduct(req, res) {
        try {
            const stock = await Stock.getProductStock(req.params.id);
            if (!stock) {
                return res.status(404).json({ error: 'Stok bulunamadı' });
            }
            res.json(stock);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    // Stok güncelleme
    static async updateStock(req, res) {
        try {
            console.log('Stok güncelleme isteği:', req.params.id);
            
            // Ürün ID'sine göre stok bul
            const stock = await Stock.findOne({ product: req.params.id });
            
            if (!stock) {
                console.log('Ürün için stok bulunamadı:', req.params.id);
                return res.status(404).json({
                    success: false,
                    message: 'Bu ürün için stok kaydı bulunamadı'
                });
            }

            console.log('Mevcut stok:', stock);
            console.log('Güncellenecek veriler:', req.validatedStockUpdate);

            // Stok miktarını güncelle
            if (req.validatedStockUpdate.type === 'add') {
                stock.quantity += req.validatedStockUpdate.quantity;
            } else if (req.validatedStockUpdate.type === 'remove') {
                if (stock.quantity < req.validatedStockUpdate.quantity) {
                    return res.status(400).json({
                        success: false,
                        message: 'Yetersiz stok miktarı',
                        currentStock: stock.quantity,
                        requestedQuantity: req.validatedStockUpdate.quantity
                    });
                }
                stock.quantity -= req.validatedStockUpdate.quantity;
            }

            // Stok hareketini kaydet
            stock.movements.push({
                type: req.validatedStockUpdate.type,
                quantity: req.validatedStockUpdate.quantity,
                reason: req.validatedStockUpdate.reason,
                note: req.validatedStockUpdate.note,
                date: new Date(),
                user: req.user._id
            });

            await stock.save();
            
            // Cache'i temizle
            stockCache.del(`stock_${stock._id}`);
            stockCache.del(`stock_product_${req.params.id}`);

            console.log('Stok güncellendi:', stock);

            res.json({
                success: true,
                message: 'Stok başarıyla güncellendi',
                data: stock
            });
        } catch (error) {
            console.error('Stok güncelleme hatası:', error);
            res.status(400).json({
                success: false,
                message: 'Stok güncellenirken bir hata oluştu',
                error: error.message
            });
        }
    }

    // Stok kullanılabilirliğini kontrol et
    static async checkAvailability(req, res) {
        try {
            const { id } = req.params;
            const { quantity } = req.query;

            // Ürünü bul
            const product = await Product.findById(id);
            if (!product) {
                return res.status(404).json({
                    success: false,
                    message: 'Ürün bulunamadı'
                });
            }

            // Stok bilgisini getir
            const stock = await Stock.findOne({ product: id });
            if (!stock) {
                return res.status(404).json({
                    success: false,
                    message: 'Stok bilgisi bulunamadı'
                });
            }

            // Aktif rezervasyonları kontrol et
            const activeReservations = await StockReservation.find({
                product: id,
                status: { $in: ['CART', 'CHECKOUT'] },
                expiresAt: { $gt: new Date() }
            });

            // Rezerve edilmiş toplam miktar
            const reservedQuantity = activeReservations.reduce((total, res) => total + res.quantity, 0);
            
            // Kullanılabilir stok miktarı
            const availableQuantity = stock.quantity - reservedQuantity;
            const requestedQuantity = parseInt(quantity) || 1;

            return res.status(200).json({
                success: true,
                data: {
                    available: availableQuantity >= requestedQuantity,
                    availableQuantity,
                    requestedQuantity
                }
            });
        } catch (error) {
            console.error('Stok kontrolü hatası:', error);
            return res.status(500).json({
                success: false,
                message: 'Stok kontrolü yapılırken bir hata oluştu'
            });
        }
    }

    // Cart rezervasyonu oluştur
    static async createCartReservation(req, res) {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const { id } = req.params;
            const { quantity } = req.body;
            const userId = req.user.id;

            console.log('Cart rezervasyonu isteniyor:', { productId: id, quantity, userId });

            // Ürünü bul
            const product = await Product.findById(id).session(session);
            if (!product) {
                console.error('Ürün bulunamadı:', id);
                return res.status(404).json({
                    success: false,
                    message: 'Ürün bulunamadı'
                });
            }

            // Stok kontrolü
            const stock = await Stock.findOne({ product: id }).session(session);
            if (!stock) {
                console.error('Stok bulunamadı:', id);
                return res.status(404).json({
                    success: false,
                    message: 'Stok bilgisi bulunamadı'
                });
            }

            // Aktif rezervasyonları kontrol et
            const activeReservations = await StockReservation.find({
                product: id,
                status: { $in: ['CART', 'CHECKOUT'] },
                expiresAt: { $gt: new Date() }
            }).session(session);

            // Mevcut rezerve edilmiş toplam miktar
            const currentReservedQuantity = activeReservations.reduce((total, res) => total + res.quantity, 0);
            
            // Yeni rezervasyonla birlikte toplam rezerve miktarı
            const newTotalReservedQuantity = currentReservedQuantity + quantity;
            
            // Kullanılabilir stok miktarı kontrolü
            if (stock.quantity < newTotalReservedQuantity) {
                console.error('Yetersiz stok:', { 
                    available: stock.quantity - currentReservedQuantity, 
                    requested: quantity 
                });
                return res.status(400).json({
                    success: false,
                    message: 'Yeterli stok bulunmuyor',
                    available: stock.quantity - currentReservedQuantity,
                    requested: quantity
                });
            }

            // Rezervasyon oluştur
            const reservation = new StockReservation({
                product: id,
                user: userId,
                quantity,
                status: 'CART',
                expiresAt: new Date(Date.now() + 30 * 60 * 1000) // 30 dakika
            });

            await reservation.save({ session });

            // Stock modelinde reservedQuantity'yi güncelle
            // Tüm aktif rezervasyonların toplamını kullan
            await Stock.findOneAndUpdate(
                { product: id },
                { reservedQuantity: newTotalReservedQuantity },
                { session }
            );

            await session.commitTransaction();
            console.log('Rezervasyon oluşturuldu:', reservation);

            res.status(201).json({
                success: true,
                message: 'Rezervasyon başarıyla oluşturuldu',
                data: {
                    reservationId: reservation._id,
                    expiresAt: reservation.expiresAt,
                    currentReservedQuantity: newTotalReservedQuantity
                }
            });
        } catch (error) {
            await session.abortTransaction();
            console.error('Rezervasyon oluşturma hatası:', error);
            res.status(500).json({
                success: false,
                message: 'Rezervasyon oluşturulurken bir hata oluştu',
                error: error.message
            });
        } finally {
            session.endSession();
        }
    }

    // Checkout rezervasyonu oluştur
    static async createCheckoutReservation(req, res) {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const productId = req.params.id; // productId yerine id kullanıyoruz
            const { quantity } = req.body;

            // Mevcut rezervasyonu kontrol et
            const existingReservation = await StockReservation.findOne({
                product: productId,
                user: req.user._id,
                status: 'CART'
            }).session(session);

            if (existingReservation) {
                // Mevcut rezervasyonu checkout'a çevir
                await existingReservation.convertToCheckout();
                
                await session.commitTransaction();
                return res.json({
                    success: true,
                    data: existingReservation
                });
            }

            // Yeni checkout rezervasyonu oluştur
            const stock = await Stock.findOne({ product: productId }).session(session);
            if (!stock) {
                await session.abortTransaction();
                return res.status(404).json({
                    success: false,
                    message: 'Stok bulunamadı'
                });
            }

            const isAvailable = await stock.canReserve(quantity);
            if (!isAvailable) {
                await session.abortTransaction();
                return res.status(400).json({
                    success: false,
                    message: 'Yeterli stok bulunmuyor'
                });
            }

            const reservation = await StockReservation.create([{
                product: productId,
                user: req.user._id,
                quantity,
                status: 'CHECKOUT',
                expiresAt: new Date(Date.now() + (15 * 60 * 1000)) // 15 dakika
            }], { session });

            await session.commitTransaction();

            res.json({
                success: true,
                data: reservation[0]
            });
        } catch (error) {
            await session.abortTransaction();
            console.error('Checkout rezervasyonu hatası:', error);
            res.status(500).json({
                success: false,
                message: 'Checkout rezervasyonu oluşturulurken bir hata oluştu'
            });
        } finally {
            session.endSession();
        }
    }

    // Rezervasyonu onayla
    static async confirmReservation(req, res) {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const { reservationId } = req.params;

            const reservation = await StockReservation.findOne({
                _id: reservationId,
                user: req.user._id,
                status: 'CHECKOUT'
            }).session(session);

            if (!reservation) {
                await session.abortTransaction();
                return res.status(404).json({
                    success: false,
                    message: 'Rezervasyon bulunamadı'
                });
            }

            await reservation.confirm();
            await session.commitTransaction();

            res.json({
                success: true,
                data: reservation
            });
        } catch (error) {
            await session.abortTransaction();
            console.error('Rezervasyon onaylama hatası:', error);
            res.status(500).json({
                success: false,
                message: 'Rezervasyon onaylanırken bir hata oluştu'
            });
        } finally {
            session.endSession();
        }
    }

    // Rezervasyonu iptal et
    static async cancelReservation(req, res) {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const { reservationId } = req.params;

            const reservation = await StockReservation.findOne({
                _id: reservationId,
                user: req.user._id,
                status: { $in: ['CART', 'CHECKOUT'] }
            }).session(session);

            if (!reservation) {
                await session.abortTransaction();
                return res.status(404).json({
                    success: false,
                    message: 'Rezervasyon bulunamadı'
                });
            }

            await reservation.cancel();
            await session.commitTransaction();

            res.json({
                success: true,
                data: reservation
            });
        } catch (error) {
            await session.abortTransaction();
            console.error('Rezervasyon iptal hatası:', error);
            res.status(500).json({
                success: false,
                message: 'Rezervasyon iptal edilirken bir hata oluştu'
            });
        } finally {
            session.endSession();
        }
    }

    // Stok rezervasyonunu güncelle
    static async updateReservation(req, res) {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const { quantity } = req.body;
            const { id: productId, reservationId } = req.params;

            // Rezervasyonu bul
            const reservation = await StockReservation.findById(reservationId).session(session);
            if (!reservation) {
                throw new Error('Rezervasyon bulunamadı');
            }

            // Stoku bul
            const stock = await Stock.findOne({ product: productId }).session(session);
            if (!stock) {
                throw new Error('Stok bulunamadı');
            }

            // Yeni miktar için stok kontrolü
            const quantityDiff = quantity - reservation.quantity;
            if (stock.availableQuantity < quantityDiff) {
                throw new Error('Yetersiz stok miktarı');
            }

            // Rezervasyon ve stok miktarlarını güncelle
            stock.reservedQuantity += quantityDiff;
            reservation.quantity = quantity;
            
            // Rezervasyon süresini yenile
            const expiresAt = new Date();
            expiresAt.setMinutes(expiresAt.getMinutes() + 30);
            reservation.expiresAt = expiresAt;

            // Değişiklikleri kaydet
            await Promise.all([
                reservation.save({ session }),
                stock.save({ session })
            ]);

            await session.commitTransaction();

            res.json({
                success: true,
                message: 'Rezervasyon güncellendi',
                data: {
                    quantity: reservation.quantity,
                    expiresAt: reservation.expiresAt
                }
            });
        } catch (error) {
            await session.abortTransaction();
            console.error('Rezervasyon güncelleme hatası:', error);
            res.status(400).json({
                success: false,
                message: error.message
            });
        } finally {
            session.endSession();
        }
    }

    // Stok rezervasyonu oluşturma (Sepet onaylama aşaması)
    static async createReservation(req, res) {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const { quantity } = req.body;
            
            // Önce product ID'ye göre stok bul
            const stock = await Stock.findOne({ product: req.params.id }).session(session);

            if (!stock) {
                throw new Error('Bu ürün için stok bulunamadı');
            }

            // Stok miktarını kontrol et
            if (!stock.canReserve(quantity)) {
                throw new Error('Yetersiz stok miktarı');
            }

            // Geçici rezervasyon oluştur
            const expiresAt = new Date();
            expiresAt.setMinutes(expiresAt.getMinutes() + 30); // 30 dakika

            const reservation = new StockReservation({
                stockId: stock._id,
                quantity,
                status: 'TEMPORARY',
                expiresAt
            });

            // Stok miktarını güncelle
            stock.reservedQuantity += quantity;

            // Değişiklikleri kaydet
            await reservation.save({ session });
            await stock.save({ session });
            await session.commitTransaction();

            stockCache.del(`stock_${stock._id}`);
            
            res.status(201).json({
                success: true,
                message: 'Geçici rezervasyon oluşturuldu',
                data: {
                    stockId: stock._id,
                    reservationId: reservation._id,
                    quantity: reservation.quantity,
                    expiresAt: reservation.expiresAt,
                    status: reservation.status
                }
            });
        } catch (error) {
            await session.abortTransaction();
            console.error('Rezervasyon oluşturma hatası:', error);
            res.status(400).json({
                success: false,
                message: error.message
            });
        } finally {
            session.endSession();
        }
    }

    // Toplu rezervasyon onaylama
    static async confirmReservationOld(req, res) {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const { id: stockId, reservationId } = req.params;
            
            // Stok ve rezervasyonu bul
            const stock = await Stock.findById(stockId).session(session);
            if (!stock) {
                throw new Error('Stok bulunamadı');
            }

            // Rezervasyonu bul ve güncelle
            const reservation = stock.reservations.id(reservationId);
            if (!reservation) {
                throw new Error('Rezervasyon bulunamadı');
            }

            if (reservation.status !== 'TEMPORARY') {
                throw new Error('Rezervasyon zaten onaylanmış veya iptal edilmiş');
            }

            // Rezervasyonu onayla
            reservation.status = 'CONFIRMED';
            await stock.save({ session });

            await session.commitTransaction();

            res.json({
                success: true,
                message: 'Rezervasyon onaylandı',
                data: stock
            });
        } catch (error) {
            await session.abortTransaction();
            console.error('Rezervasyon onaylama hatası:', error);
            res.status(400).json({
                success: false,
                message: error.message
            });
        } finally {
            session.endSession();
        }
    }

    // Rezervasyon iptali
    static async cancelReservationOld(req, res) {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const { id: stockId, reservationId } = req.params;
            
            // Stok ve rezervasyonu bul
            const stock = await Stock.findById(stockId).session(session);
            if (!stock) {
                throw new Error('Stok bulunamadı');
            }

            // Rezervasyonu bul
            const reservation = stock.reservations.id(reservationId);
            if (!reservation) {
                throw new Error('Rezervasyon bulunamadı');
            }

            if (reservation.status === 'CANCELLED') {
                throw new Error('Rezervasyon zaten iptal edilmiş');
            }

            // Rezervasyonu iptal et ve stok miktarını güncelle
            reservation.status = 'CANCELLED';
            stock.reservedQuantity -= reservation.quantity;
            await stock.save({ session });

            // Cache'i temizle
            stockCache.del(`stock_${stockId}`);

            await session.commitTransaction();

            res.json({
                success: true,
                message: 'Rezervasyon iptal edildi',
                data: stock
            });
        } catch (error) {
            await session.abortTransaction();
            console.error('Rezervasyon iptal hatası:', error);
            res.status(400).json({
                success: false,
                message: error.message
            });
        } finally {
            session.endSession();
        }
    }

    // Rezervasyon durumu kontrolü
    static async checkReservationStatus(req, res) {
        try {
            const { productId } = req.params;
            const userId = req.user._id;

            const reservation = await StockReservation.findOne({
                product: productId,
                user: userId,
                status: { $in: ['CART', 'CHECKOUT'] }
            });

            if (!reservation) {
                return res.json({
                    success: true,
                    data: { exists: false }
                });
            }

            res.json({
                success: true,
                data: {
                    exists: true,
                    status: reservation.status,
                    quantity: reservation.quantity,
                    isExpired: reservation.isExpired,
                    remainingTime: reservation.remainingTime,
                    expiresAt: reservation.expiresAt
                }
            });
        } catch (error) {
            console.error('Rezervasyon durumu kontrolü hatası:', error);
            res.status(500).json({
                success: false,
                message: 'Rezervasyon durumu kontrol edilirken bir hata oluştu'
            });
        }
    }

    // Rezervasyon süresini uzatma
    static async extendReservation(req, res) {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const { reservationId } = req.params;
            const { duration = 60 * 60 * 1000 } = req.body; // Varsayılan 1 saat

            const reservation = await StockReservation.findOne({
                _id: reservationId,
                user: req.user._id,
                status: { $in: ['CART', 'CHECKOUT'] }
            }).session(session);

            if (!reservation) {
                await session.abortTransaction();
                return res.status(404).json({
                    success: false,
                    message: 'Rezervasyon bulunamadı'
                });
            }

            if (reservation.isExpired) {
                // Stok kontrolü
                const stock = await Stock.findOne({ product: reservation.product }).session(session);
                const isAvailable = await stock.canReserve(reservation.quantity);

                if (!isAvailable) {
                    await session.abortTransaction();
                    return res.status(400).json({
                        success: false,
                        message: 'Yeterli stok bulunmuyor'
                    });
                }
            }

            await reservation.extend(duration);
            await session.commitTransaction();

            res.json({
                success: true,
                data: reservation
            });
        } catch (error) {
            await session.abortTransaction();
            console.error('Rezervasyon uzatma hatası:', error);
            res.status(500).json({
                success: false,
                message: 'Rezervasyon uzatılırken bir hata oluştu'
            });
        } finally {
            session.endSession();
        }
    }

    // Toplu rezervasyon oluşturma
    static async createBatchReservations(req, res) {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const { items } = req.body;
            const results = [];

            for (const item of items) {
                try {
                    // Stok kontrolü
                    const stock = await Stock.findOne({ 
                        product: item.productId 
                    }).session(session);

                    if (!stock) {
                        results.push({
                            productId: item.productId,
                            success: false,
                            message: 'Stok bulunamadı'
                        });
                        continue;
                    }

                    const isAvailable = await stock.canReserve(item.quantity);
                    if (!isAvailable) {
                        results.push({
                            productId: item.productId,
                            success: false,
                            message: 'Yeterli stok bulunmuyor'
                        });
                        continue;
                    }

                    // Rezervasyon oluştur
                    const reservation = await StockReservation.createCartReservation(
                        item.productId,
                        req.user._id,
                        item.quantity
                    );

                    results.push({
                        productId: item.productId,
                        success: true,
                        reservationId: reservation._id
                    });
                } catch (error) {
                    results.push({
                        productId: item.productId,
                        success: false,
                        message: error.message
                    });
                }
            }

            await session.commitTransaction();

            res.json({
                success: true,
                data: results
            });
        } catch (error) {
            await session.abortTransaction();
            console.error('Toplu rezervasyon hatası:', error);
            res.status(500).json({
                success: false,
                message: 'Rezervasyonlar oluşturulurken bir hata oluştu'
            });
        } finally {
            session.endSession();
        }
    }

    // Stok uygunluğunu kontrol et
    static async validateStockAvailability(req, res) {
        try {
            const { productId } = req.params;
            const { quantity } = req.query;

            // Stok kontrolü
            const stock = await Stock.findOne({ product: productId });
            if (!stock) {
                return res.status(404).json({
                    success: false,
                    message: 'Stok bulunamadı'
                });
            }

            // Aktif rezervasyonları getir
            const activeReservations = await StockReservation.findActiveReservations(productId);
            const reservedQuantity = activeReservations.reduce(
                (total, res) => total + res.quantity, 
                0
            );

            const availableQuantity = stock.quantity - reservedQuantity;
            const isAvailable = availableQuantity >= quantity;

            res.json({
                success: true,
                data: {
                    isAvailable,
                    availableQuantity,
                    reservedQuantity,
                    totalQuantity: stock.quantity
                }
            });
        } catch (error) {
            console.error('Stok kontrolü hatası:', error);
            res.status(500).json({
                success: false,
                message: 'Stok kontrolü yapılırken bir hata oluştu'
            });
        }
    }

    // Rezervasyonu onayla
    static async confirmReservation(req, res) {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const { reservationId } = req.params;

            const reservation = await StockReservation.findOne({
                _id: reservationId,
                user: req.user._id,
                status: 'CHECKOUT'
            }).session(session);

            if (!reservation) {
                await session.abortTransaction();
                return res.status(404).json({
                    success: false,
                    message: 'Rezervasyon bulunamadı'
                });
            }

            await reservation.confirm();
            await session.commitTransaction();

            res.json({
                success: true,
                data: reservation
            });
        } catch (error) {
            await session.abortTransaction();
            console.error('Rezervasyon onaylama hatası:', error);
            res.status(500).json({
                success: false,
                message: 'Rezervasyon onaylanırken bir hata oluştu'
            });
        } finally {
            session.endSession();
        }
    }

    // Rezervasyonu iptal et
    static async cancelReservation(req, res) {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const { reservationId } = req.params;

            const reservation = await StockReservation.findOne({
                _id: reservationId,
                user: req.user._id,
                status: { $in: ['CART', 'CHECKOUT'] }
            }).session(session);

            if (!reservation) {
                await session.abortTransaction();
                return res.status(404).json({
                    success: false,
                    message: 'Rezervasyon bulunamadı'
                });
            }

            await reservation.cancel();
            await session.commitTransaction();

            res.json({
                success: true,
                data: reservation
            });
        } catch (error) {
            await session.abortTransaction();
            console.error('Rezervasyon iptal hatası:', error);
            res.status(500).json({
                success: false,
                message: 'Rezervasyon iptal edilirken bir hata oluştu'
            });
        } finally {
            session.endSession();
        }
    }
}

export default StockController;