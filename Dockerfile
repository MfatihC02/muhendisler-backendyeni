# Node.js imajını kullan
FROM node:20-alpine

# Çalışma dizinini oluştur
WORKDIR /app

# Package.json ve package-lock.json dosyalarını kopyala
COPY package*.json ./

# Bağımlılıkları yükle
RUN npm install

# Tüm kaynak kodları kopyala
COPY . .

# PM2'yi global olarak yükle
RUN npm install pm2 -g

# Port'u aç
EXPOSE 3000

# PM2 ile başlat
CMD ["pm2-runtime", "ecosystem.config.cjs"]
