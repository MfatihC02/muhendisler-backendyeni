import {Filter} from 'bad-words';

class CommentValidator {
    constructor() {
        this.filter = new Filter();
        
        // Türkçe uygunsuz kelimeleri ekle
        this.filter.addWords(
            'bok', 'siktir', 'mal', 'salak', 'gerizekalı', 'aptal',
            'dangalak', 'hıyar', 'manyak', 'aptal', 'kafasız',
            'ahmak', 'göt', 'piç', 'yavşak', 'şerefsiz'
            // Daha fazla kelime eklenebilir
        );
    }

    validateComment(comment) {
        // Boş kontrol
        if (!comment || comment.trim().length === 0) {
            return {
                isValid: false,
                message: 'Yorum boş olamaz'
            };
        }

        // Minimum uzunluk kontrolü
        if (comment.trim().length < 2) {
            return {
                isValid: false,
                message: 'Yorum çok kısa'
            };
        }

        // Uygunsuz içerik kontrolü
        if (this.filter.isProfane(comment)) {
            return {
                isValid: false,
                message: 'Yorumunuz uygunsuz içerik içeriyor'
            };
        }

        return {
            isValid: true,
            comment: comment.trim()
        };
    }

    // Express middleware
    middleware() {
        return (req, res, next) => {
            // Sadece POST ve PUT isteklerini kontrol et
            if ((req.method === 'POST' || req.method === 'PUT') && req.body.comment) {
                const validationResult = this.validateComment(req.body.comment);
                
                if (!validationResult.isValid) {
                    return res.status(400).json({
                        success: false,
                        message: validationResult.message
                    });
                }

                // Temizlenmiş yorumu request'e ekle
                req.body.comment = validationResult.comment;
            }
            
            next();
        };
    }
}

// Singleton instance oluştur
const commentValidator = new CommentValidator();

export default commentValidator.middleware();
