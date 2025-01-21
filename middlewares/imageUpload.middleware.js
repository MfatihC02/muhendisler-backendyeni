import multer from 'multer';
import { uploadToCloudinary } from '../utils/imageUtils.js';

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

    if (!allowedTypes.includes(file.mimetype)) {
        cb(new Error('Desteklenmeyen dosya formatı. Sadece JPEG, JPG, PNG ve WEBP formatları kabul edilir'), false);
        return;
    }

    cb(null, true);
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB
    }
});

export const handleImageUpload = (req, res, next) => {
    console.log('HandleImageUpload middleware başladı');

    upload.single('image')(req, res, async function (err) {
        if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({
                    success: false,
                    message: 'Dosya boyutu 5MB\'dan büyük olamaz'
                });
            }
            return res.status(400).json({
                success: false,
                message: 'Dosya yükleme hatası',
                error: err.message
            });
        } else if (err) {
            return res.status(400).json({
                success: false,
                message: err.message
            });
        }

        if (req.file) {
            console.log('Dosya alındı:', {
                filename: req.file.originalname,
                size: req.file.size,
                mimetype: req.file.mimetype
            });
        }

        next();
    });
};