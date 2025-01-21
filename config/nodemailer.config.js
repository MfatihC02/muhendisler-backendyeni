import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

// Gmail SMTP transporter konfigürasyonu
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD
    }
});

// E-posta gönderme fonksiyonu
const sendEmail = async ({ name, email, phone, subject, message }) => {
    try {
        // E-posta şablonu
        const mailOptions = {
            from: `"${name}" <${process.env.GMAIL_USER}>`,
            to: process.env.GMAIL_USER,
            replyTo: email,  // Yanıt bu adrese gidecek
            subject: `İletişim Formu: ${subject}`,
            html: `
                <h3>Yeni İletişim Formu Mesajı</h3>
                <p><strong>Gönderen:</strong> ${name}</p>
                <p><strong>E-posta:</strong> ${email}</p>
                <p><strong>Telefon:</strong> ${phone}</p>
                <p><strong>Konu:</strong> ${subject}</p>
                <p><strong>Mesaj:</strong></p>
                <p>${message}</p>
            `
        };

        // E-posta gönderimi
        const info = await transporter.sendMail(mailOptions);
        return { success: true, messageId: info.messageId };

    } catch (error) {
        console.error('E-posta gönderimi başarısız:', error);
        throw new Error('E-posta gönderilemedi');
    }
};

export { sendEmail };
