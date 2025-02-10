import mongoose from 'mongoose';
import { addToCartSchema, updateCartItemSchema } from '../middlewares/cart.validation.js';
import { Cart } from '../models/cart.model.js';
import StockReservation from '../models/stockReservation.model.js';
import {Stock} from '../models/stock.model.js';

const Product = mongoose.model('Product');

export const getCart = async (req, res) => {
    try {
        let cart = await Cart.findOne({ user: req.user._id })
            .populate('items.product', 'name sku images price stock productType');

        if (!cart) {
            cart = await Cart.create({ user: req.user._id, items: [] });
        }

        res.json({
            success: true,
            data: cart
        });
    } catch (error) {
        console.error('Get cart error:', error);
        res.status(500).json({
            success: false,
            message: 'Sepet bilgileri alınamadı'
        });
    }
};

export const addToCart = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { error, value } = addToCartSchema.validate(req.body);
        if (error) {
            await session.abortTransaction();
            return res.status(400).json({
                success: false,
                message: error.details[0].message
            });
        }

        const { productId, quantity } = value;

        // 1. Ürün ve stok kontrolü
        const stock = await Stock.findOne({ product: productId })
            .populate('product', 'name price stock unit')
            .session(session);

        if (!stock) {
            await session.abortTransaction();
            return res.status(404).json({
                success: false,
                message: 'Ürün bulunamadı'
            });
        }

        // 2. Sepet işlemleri
        let cart = await Cart.findOne({ user: req.user._id }).session(session);
        if (!cart) {
            cart = new Cart({ user: req.user._id, items: [] });
        }

        const existingItemIndex = cart.items.findIndex(
            item => item.product.toString() === productId
        );

        if (existingItemIndex > -1) {
            cart.items[existingItemIndex].quantity = quantity;
        } else {
            cart.items.push({
                product: productId,
                quantity,
                price: stock.product.price.current,
                unit: stock.product.stock.unit
            });
        }

        await cart.save({ session });
        await session.commitTransaction();

        // 3. Güncel sepeti getir
        cart = await Cart.findById(cart._id)
            .populate('items.product', 'name sku images price stock');

        console.log('Ürün sepete eklendi:', {
            product: stock.product.name,
            quantity,
            user: req.user._id
        });

        res.status(200).json({
            success: true,
            message: 'Ürün sepete eklendi',
            data: cart
        });

    } catch (error) {
        await session.abortTransaction();
        console.error('Sepete ekleme hatası:', error);
        res.status(500).json({
            success: false,
            message: 'Ürün sepete eklenemedi'
        });
    } finally {
        session.endSession();
    }
};

export const updateCartItem = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { error, value } = updateCartItemSchema.validate(req.body);
        if (error) {
            return res.status(400).json({
                success: false,
                message: error.details[0].message
            });
        }

        const { quantity } = value;
        const { productId } = req.params;

        // Sepeti bul
        let cart = await Cart.findOne({ user: req.user._id }).session(session);
        if (!cart) {
            await session.abortTransaction();
            return res.status(404).json({
                success: false,
                message: 'Sepet bulunamadı'
            });
        }

        // Ürünü bul
        const itemIndex = cart.items.findIndex(
            item => item.product.toString() === productId
        );

        if (itemIndex === -1) {
            await session.abortTransaction();
            return res.status(404).json({
                success: false,
                message: 'Ürün sepette bulunamadı'
            });
        }

        // Stok kontrolü
        const stock = await Stock.findOne({ product: productId }).session(session);
        if (!stock) {
            await session.abortTransaction();
            return res.status(404).json({
                success: false,
                message: 'Stok bilgisi bulunamadı'
            });
        }

        // Mevcut rezervasyonu bul
        const existingReservation = await StockReservation.findOne({
            product: productId,
            user: req.user._id,
            status: { $in: ['CART', 'CHECKOUT'] }
        }).session(session);

        let currentReservedQuantity = 0;
        // Eğer mevcut rezervasyon varsa iptal et ve stok miktarını güncelle
        if (existingReservation) {
            currentReservedQuantity = existingReservation.quantity;
            // Mevcut rezervasyonu iptal et
            await existingReservation.cancel(session);
            // Stok rezervasyon miktarını güncelle
            stock.reservedQuantity -= currentReservedQuantity;
            await stock.save({ session });
        }

        // Yeni miktar için stok kontrolü (mevcut rezervasyon iptal edildiği için kullanılabilir stok arttı)
        const availableQuantity = stock.quantity - stock.reservedQuantity;
        if (availableQuantity < quantity) {
            await session.abortTransaction();
            return res.status(400).json({
                success: false,
                message: 'Yetersiz stok',
                availableQuantity
            });
        }

        // Yeni rezervasyon oluştur
        const newReservation = new StockReservation({
            product: productId,
            user: req.user._id,
            quantity: quantity,
            status: 'CART',
            expiresAt: new Date(Date.now() + 30 * 60 * 1000) // 30 dakika
        });

        // Stok miktarını güncelle
        stock.reservedQuantity += quantity;

        // Değişiklikleri kaydet
        await Promise.all([
            newReservation.save({ session }),
            stock.save({ session }),
            Cart.updateOne(
                { _id: cart._id, 'items._id': cart.items[itemIndex]._id },
                { $set: { 'items.$.quantity': quantity } },
                { session }
            )
        ]);

        // Güncel sepeti getir
        cart = await Cart.findById(cart._id)
            .populate('items.product', 'name sku images price stock')
            .session(session);

        await session.commitTransaction();

        res.json({
            success: true,
            data: cart,
            message: 'Ürün miktarı güncellendi'
        });

    } catch (error) {
        await session.abortTransaction();
        console.error('Update cart item error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Ürün güncellenemedi'
        });
    } finally {
        session.endSession();
    }
};

export const removeFromCart = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
  
    try {
      const { productId } = req.params;
      const userId = req.user._id;
  
      // 1. Tüm aktif rezervasyonları bul (CART ve CHECKOUT)
      const reservations = await StockReservation.find({
        product: productId,
        user: userId,
        status: { $in: ['CART', 'CHECKOUT'] }
      }).session(session);
  
      // 2. Bulunan tüm rezervasyonları iptal et
      for (const reservation of reservations) {
        await reservation.cancel(session); // 
      }
  
      // 3. Stock'u senkronize et
      const stock = await Stock.findOne({ product: productId }).session(session);
      if (stock) {
        await stock.syncReservedQuantity(session); // 
      }
  
      // 4. Ürünü cart'tan sil
      let cart = await Cart.findOne({ user: userId }).session(session);
      if (!cart) {
        await session.abortTransaction();
        return res.status(404).json({
          success: false,
          message: 'Sepet bulunamadı'
        });
      }
  
      cart.items = cart.items.filter(
        item => item.product.toString() !== productId
      );
  
      await cart.save({ session });
  
      // 5. Transaction'ı tamamla
      await session.commitTransaction();
  
      // 6. Güncellenmiş sepeti getir
      cart = await Cart.findById(cart._id)
        .populate('items.product', 'name sku images price stock');
  
      res.json({
        success: true,
        data: cart
      });
  
    } catch (error) {
      await session.abortTransaction();
      console.error('Remove from cart error:', error);
      res.status(500).json({
        success: false,
        message: 'Ürün sepetten çıkarılamadı'
      });
    } finally {
      session.endSession();
    }
  };
  
export const clearCart = async (req, res) => {
    try {
        const cart = await Cart.findOne({ user: req.user._id });
        if (!cart) {
            return res.status(404).json({
                success: false,
                message: 'Sepet bulunamadı'
            });
        }

        cart.items = [];
        await cart.save();

        res.json({
            success: true,
            message: 'Sepet temizlendi'
        });

    } catch (error) {
        console.error('Clear cart error:', error);
        res.status(500).json({
            success: false,
            message: 'Sepet temizlenemedi'
        });
    }
};

export const validateCartItems = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const cart = await Cart.findOne({ user: req.user._id })
            .populate('items.product', 'name sku images price stock')
            .session(session);

        if (!cart || cart.items.length === 0) {
            await session.abortTransaction();
            return res.json({
                success: true,
                data: {
                    isValid: true,
                    items: []
                }
            });
        }

        const validationResults = [];

        for (const item of cart.items) {
            try {
                // Stok kontrolü
                const stock = await Stock.findOne({ 
                    product: item.product._id 
                }).session(session);

                if (!stock) {
                    validationResults.push({
                        productId: item.product._id,
                        isValid: false,
                        message: 'Stok bulunamadı'
                    });
                    continue;
                }

                // Rezervasyon kontrolü
                const reservation = await StockReservation.findOne({
                    product: item.product._id,
                    user: req.user._id,
                    status: { $in: ['CART', 'CHECKOUT'] }
                }).session(session);

                if (!reservation) {
                    // Yeni stok kontrolü
                    const isAvailable = await stock.canReserve(item.quantity);
                    if (!isAvailable) {
                        validationResults.push({
                            productId: item.product._id,
                            isValid: false,
                            message: 'Yeterli stok bulunmuyor'
                        });
                        continue;
                    }
                } else if (reservation.isExpired) {
                    // Süresi dolmuş rezervasyon için stok kontrolü
                    const isAvailable = await stock.canReserve(item.quantity);
                    if (!isAvailable) {
                        validationResults.push({
                            productId: item.product._id,
                            isValid: false,
                            message: 'Yeterli stok bulunmuyor'
                        });
                        continue;
                    }
                }

                validationResults.push({
                    productId: item.product._id,
                    isValid: true,
                    quantity: item.quantity
                });
            } catch (error) {
                validationResults.push({
                    productId: item.product._id,
                    isValid: false,
                    message: error.message
                });
            }
        }

        await session.commitTransaction();

        res.json({
            success: true,
            data: {
                isValid: validationResults.every(result => result.isValid),
                items: validationResults
            }
        });
    } catch (error) {
        await session.abortTransaction();
        console.error('Sepet doğrulama hatası:', error);
        res.status(500).json({
            success: false,
            message: 'Sepet doğrulanırken bir hata oluştu'
        });
    } finally {
        session.endSession();
    }
};

export const startCheckoutProcess = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const cart = await Cart.findOne({ user: req.user._id })
            .populate('items.product')
            .session(session);

        if (!cart || cart.items.length === 0) {
            await session.abortTransaction();
            return res.status(400).json({
                success: false,
                message: 'Sepet boş'
            });
        }

        const checkoutResults = [];

        for (const item of cart.items) {
            try {
                // Mevcut rezervasyonu bul
                const existingReservation = await StockReservation.findOne({
                    product: item.product._id,
                    user: req.user._id,
                    status: 'CART'
                }).session(session);

                if (existingReservation) {
                    if (existingReservation.isExpired) {
                        // Stok kontrolü
                        const stock = await Stock.findOne({ 
                            product: item.product._id 
                        }).session(session);

                        const isAvailable = await stock.canReserve(item.quantity);
                        if (!isAvailable) {
                            checkoutResults.push({
                                productId: item.product._id,
                                success: false,
                                message: 'Yeterli stok bulunmuyor'
                            });
                            continue;
                        }

                        // Yeni checkout rezervasyonu oluştur
                        await existingReservation.cancel();
                        const newReservation = await StockReservation.create([{
                            product: item.product._id,
                            user: req.user._id,
                            quantity: item.quantity,
                            status: 'CHECKOUT',
                            expiresAt: new Date(Date.now() + (15 * 60 * 1000)) // 15 dakika
                        }], { session });

                        checkoutResults.push({
                            productId: item.product._id,
                            success: true,
                            reservationId: newReservation[0]._id
                        });
                    } else {
                        // Mevcut rezervasyonu checkout'a çevir
                        await existingReservation.convertToCheckout();
                        checkoutResults.push({
                            productId: item.product._id,
                            success: true,
                            reservationId: existingReservation._id
                        });
                    }
                } else {
                    // Stok kontrolü
                    const stock = await Stock.findOne({ 
                        product: item.product._id 
                    }).session(session);

                    const isAvailable = await stock.canReserve(item.quantity);
                    if (!isAvailable) {
                        checkoutResults.push({
                            productId: item.product._id,
                            success: false,
                            message: 'Yeterli stok bulunmuyor'
                        });
                        continue;
                    }

                    // Yeni checkout rezervasyonu oluştur
                    const reservation = await StockReservation.create([{
                        product: item.product._id,
                        user: req.user._id,
                        quantity: item.quantity,
                        status: 'CHECKOUT',
                        expiresAt: new Date(Date.now() + (15 * 60 * 1000)) // 15 dakika
                    }], { session });

                    checkoutResults.push({
                        productId: item.product._id,
                        success: true,
                        reservationId: reservation[0]._id
                    });
                }
            } catch (error) {
                checkoutResults.push({
                    productId: item.product._id,
                    success: false,
                    message: error.message
                });
            }
        }

        // Tüm işlemler başarılı mı kontrol et
        const allSuccess = checkoutResults.every(result => result.success);

        if (!allSuccess) {
            await session.abortTransaction();
            return res.status(400).json({
                success: false,
                message: 'Bazı ürünler için checkout başlatılamadı',
                data: checkoutResults
            });
        }

        await session.commitTransaction();

        res.json({
            success: true,
            data: {
                checkoutStarted: true,
                items: checkoutResults
            }
        });
    } catch (error) {
        await session.abortTransaction();
        console.error('Checkout başlatma hatası:', error);
        res.status(500).json({
            success: false,
            message: 'Checkout başlatılırken bir hata oluştu'
        });
    } finally {
        session.endSession();
    }
};

export const refreshCartReservations = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const cart = await Cart.findOne({ user: req.user._id })
            .populate('items.product')
            .session(session);

        if (!cart || cart.items.length === 0) {
            await session.abortTransaction();
            return res.json({
                success: true,
                data: {
                    refreshed: true,
                    items: []
                }
            });
        }

        const refreshResults = [];

        for (const item of cart.items) {
            try {
                // Tüm aktif rezervasyonları kontrol et (CART veya CHECKOUT)
                const existingReservation = await StockReservation.findOne({
                    product: item.product._id,
                    user: req.user._id,
                    status: { $in: ['CART', 'CHECKOUT'] }
                }).session(session);

                // Stok kontrolü için stock'u populate et
                const stock = await Stock.findOne({ product: item.product._id })
                    .populate('product', 'name')
                    .session(session);

                if (!stock) {
                    refreshResults.push({
                        productId: item.product._id,
                        success: false,
                        message: 'Ürün stokta bulunamadı'
                    });
                    continue;
                }

                if (existingReservation) {
                    // Rezervasyon varsa güncelle
                    if (existingReservation.isExpired) {
                        // Süresi dolmuşsa yenile
                        await existingReservation.extend(60 * 60 * 1000); // 1 saat
                        console.log('Rezervasyon yenilendi:', {
                            product: stock.product.name,
                            reservationId: existingReservation._id
                        });
                    }

                    // Miktarı güncelle (değiştiyse)
                    if (existingReservation.quantity !== item.quantity) {
                        existingReservation.quantity = item.quantity;
                        await existingReservation.save({ session });
                        console.log('Rezervasyon miktarı güncellendi:', {
                            product: stock.product.name,
                            oldQuantity: existingReservation.quantity,
                            newQuantity: item.quantity
                        });
                    }

                    refreshResults.push({
                        productId: item.product._id,
                        success: true,
                        reservationId: existingReservation._id,
                        message: 'Rezervasyon güncellendi'
                    });
                } else {
                    // Yeni rezervasyon oluştur
                    const newReservation = await StockReservation.createCartReservation(
                        item.product._id,
                        req.user._id,
                        item.quantity,
                        session
                    );

                    console.log('Yeni rezervasyon oluşturuldu:', {
                        product: stock.product.name,
                        reservationId: newReservation._id,
                        quantity: item.quantity
                    });

                    refreshResults.push({
                        productId: item.product._id,
                        success: true,
                        reservationId: newReservation._id,
                        message: 'Yeni rezervasyon oluşturuldu'
                    });
                }
            } catch (error) {
                console.error('Ürün rezervasyon hatası:', {
                    productId: item.product._id,
                    error: error.message
                });
                refreshResults.push({
                    productId: item.product._id,
                    success: false,
                    message: 'Rezervasyon işlemi başarısız: ' + error.message
                });
            }
        }

        await session.commitTransaction();

        res.json({
            success: true,
            data: {
                refreshed: true,
                items: refreshResults
            }
        });
    } catch (error) {
        await session.abortTransaction();
        console.error('Rezervasyon yenileme hatası:', error);
        res.status(500).json({
            success: false,
            message: 'Rezervasyonlar yenilenirken bir hata oluştu'
        });
    } finally {
        session.endSession();
    }
};
