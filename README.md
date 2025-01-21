# E-Ticaret Sitesi Backend

Bu proje, modern bir e-ticaret platformunun backend kısmını oluşturmaktadır. Node.js, Express.js ve MongoDB teknolojileri kullanılarak geliştirilmiştir.

## 🚀 Özellikler

- Kullanıcı kimlik doğrulama ve yetkilendirme
- Ürün yönetimi
- Sipariş işleme
- Kategori yönetimi
- Real-time bildirimler (Socket.IO)
- Resim yükleme ve işleme
- Rate limiting
- API validasyonu
- Gelişmiş loglama sistemi

## 🛠️ Teknolojiler

- Node.js
- Express.js
- MongoDB (Mongoose)
- Socket.IO
- JWT Authentication
- Cloudinary (Resim yönetimi)
- Winston (Loglama)
- Express Validator
- Multer
- Sharp (Resim işleme)
- ve diğerleri...

## 📦 Kurulum

1. Repoyu klonlayın:
```bash
git clone [repo-url]
cd backend
```

2. Bağımlılıkları yükleyin:
```bash
npm install
```

3. .env dosyasını oluşturun:
```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/e-ticaret
JWT_SECRET=your_jwt_secret
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

4. Uygulamayı başlatın:
```bash
npm start
```

## 🔑 Ortam Değişkenleri

| Değişken | Açıklama |
|----------|-----------|
| PORT | Sunucunun çalışacağı port |
| MONGODB_URI | MongoDB bağlantı URL'i |
| JWT_SECRET | JWT token şifreleme anahtarı |
| CLOUDINARY_CLOUD_NAME | Cloudinary cloud name |
| CLOUDINARY_API_KEY | Cloudinary API key |
| CLOUDINARY_API_SECRET | Cloudinary API secret |

## 🔌 WebSocket Events

- `connection` - Kullanıcı bağlantısı
- `order:new` - Yeni sipariş bildirimi
- `stock:update` - Stok güncelleme bildirimi
- `category:update` - Kategori güncelleme bildirimi

## 📝 Notlar

- API rate limiting aktiftir (100 istek/15 dakika)
- Resim yüklemeleri Cloudinary üzerinden yapılmaktadır
- Tüm API endpointleri JWT token doğrulaması gerektirir (auth endpoints hariç)
- Hata logları `logs` klasöründe tutulmaktadır

## 🤝 Katkıda Bulunma

1. Fork yapın
2. Feature branch oluşturun (`git checkout -b feature/amazing-feature`)
3. Değişikliklerinizi commit edin (`git commit -m 'feat: Add amazing feature'`)
4. Branch'inizi push edin (`git push origin feature/amazing-feature`)
5. Pull Request oluşturun

## 📄 Lisans

Bu proje ISC lisansı altında lisanslanmıştır.
