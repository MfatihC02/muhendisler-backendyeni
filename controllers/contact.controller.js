import { sendEmail } from '../config/nodemailer.config.js';

// Form verilerini doğrulama fonksiyonu
const validateContactForm = (data) => {
    const errors = [];
    
    if (!data.name?.trim()) errors.push('İsim alanı zorunludur');
    if (!data.email?.trim()) errors.push('E-posta alanı zorunludur');
    if (!data.phone?.trim()) errors.push('Telefon alanı zorunludur');
    if (!data.subject?.trim()) errors.push('Konu alanı zorunludur');
    if (!data.message?.trim()) errors.push('Mesaj alanı zorunludur');
    
    // E-posta formatı kontrolü
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (data.email && !emailRegex.test(data.email)) {
        errors.push('Geçerli bir e-posta adresi giriniz');
    }

    return errors;
};

// İletişim formu controller'ı
export const contactFormController = async (req, res) => {
    try {
        const formData = {
            name: req.body.fullName,
            email: req.body.email,
            phone: req.body.phone,
            subject: req.body.subject,
            message: req.body.message
        };

        // Form validasyonu
        const validationErrors = validateContactForm(formData);
        if (validationErrors.length > 0) {
            return res.status(400).json({
                success: false,
                errors: validationErrors
            });
        }

        // E-posta gönderimi
        const result = await sendEmail(formData);

        // Başarılı yanıt
        return res.status(200).json({
            success: true,
            message: 'E-posta başarıyla gönderildi',
            messageId: result.messageId
        });

    } catch (error) {
        console.error('Contact form error:', error);
        return res.status(500).json({
            success: false,
            message: 'E-posta gönderilirken bir hata oluştu',
            error: error.message
        });
    }
};
