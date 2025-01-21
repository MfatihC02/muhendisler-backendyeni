import cloudinary from '../config/cloudinary.js';

export const uploadToCloudinary = async (file) => {
    try {
        if (!file) {
            throw new Error('Dosya bulunamadı');
        }

        // Buffer kontrolü
        if (!file.buffer) {
            throw new Error('Dosya içeriği bulunamadı');
        }

        const b64 = Buffer.from(file.buffer).toString('base64');
        const dataURI = `data:${file.mimetype};base64,${b64}`;

        const result = await cloudinary.uploader.upload(dataURI, {
            folder: 'e-commerce/products',
            public_id: `product-${Date.now()}`,
            transformation: [{
                width: 1000,
                height: 1000,
                crop: 'limit',
                fetch_format: 'auto',
                quality: 'auto'
            }]
        });

        console.log('Cloudinary yükleme başarılı:', result.secure_url);
        return result;
    } catch (error) {
        console.error('Cloudinary yükleme hatası:', error);
        throw new Error('Resim yükleme hatası: ' + error.message);
    }
};

export const deleteFromCloudinary = async (public_id) => {
    try {
        if (!public_id) {
            throw new Error('Public ID bulunamadı');
        }

        const result = await cloudinary.uploader.destroy(public_id);
        console.log('Cloudinary silme başarılı:', public_id);
        return result;
    } catch (error) {
        console.error('Cloudinary silme hatası:', error);
        throw new Error('Resim silme hatası: ' + error.message);
    }
};