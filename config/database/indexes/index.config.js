import mongoose from 'mongoose';

export const DatabaseIndexes = {
  // 1. ADDRESS MODEL İNDEXLERİ
  Address: {
    performance: [
      { 
        fields: { user: 1, isDefault: 1 },
        options: { background: true }
      },
      { 
        fields: { user: 1, type: 1 },
        options: { background: true }
      }
    ]
  },

  // 2. CART MODEL İNDEXLERİ
  Cart: {
    performance: [
      { 
        fields: { lastActivity: 1 },
        options: { expireAfterSeconds: 172800 }
      }
    ]
  },

  // 3. CATEGORY MODEL İNDEXLERİ
  Category: {
    performance: [
      { 
        fields: { parent: 1, isActive: 1 },
        options: { background: true }
      },
      { 
        fields: { level: 1, order: 1 },
        options: { background: true }
      },
      { 
        fields: { parent: 1, isActive: 1, order: 1 },
        options: { background: true }
      }
    ]
  },

  // 4. ORDER MODEL İNDEXLERİ
  Order: {
    performance: [
      // Kullanıcı siparişleri listesi için
      { 
        fields: { user: 1, createdAt: -1 },
        options: { background: true }
      },
      // Sipariş durumu takibi için
      { 
        fields: { status: 1, createdAt: -1 },
        options: { background: true }
      },
      // Ödeme durumu takibi için
      { 
        fields: { 'paymentDetails.status': 1, createdAt: -1 },
        options: { background: true }
      },
      // Kargo takibi için
      { 
        fields: { 'shippingDetails.carrier': 1, 'shippingDetails.trackingNumber': 1 },
        options: { background: true }
      }
    ]
  },

  // 5. PRODUCT MODEL İNDEXLERİ
  Product: {
    performance: [
      // Kategori bazlı filtreleme için
      { 
        fields: { category: 1, status: 1 },
        options: { background: true }
      },
      // Ürün tipi bazlı filtreleme için
      { 
        fields: { productType: 1, status: 1 },
        options: { background: true }
      },
      // Fiyat bazlı filtreleme için
      { 
        fields: { 'price.current': 1, status: 1 },
        options: { background: true }
      },
      // Stok durumu kontrolü için
      { 
        fields: { 'stock.quantity': 1, status: 1 },
        options: { background: true }
      },
      // Compound index - çoklu filtreleme için
      { 
        fields: { category: 1, productType: 1, status: 1, 'price.current': 1 },
        options: { background: true }
      }
    ]
  },

  // STOCK MODEL İNDEXLERİ
  Stock: {
    performance: [
      // Ürün bazlı stok sorguları için
      { 
        fields: { product: 1, quantity: 1 },
        options: { background: true }
      },
      // Düşük stok takibi için
      { 
        fields: { quantity: 1, lowStockThreshold: 1 },
        options: { background: true }
      },
      // Son kullanma tarihi takibi için
      { 
        fields: { 'batchInfo.expiryDate': 1 },
        options: { background: true }
      }
    ]
  }
};
