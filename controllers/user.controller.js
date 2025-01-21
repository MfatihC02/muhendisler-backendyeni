import { User } from '../models/user.model.js';
import { validatePassword } from '../utils/password.util.js';

export const getProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password -refreshToken');
        res.status(200).json({
            success: true,
            data: user
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Profil bilgileri alınırken bir hata oluştu'
        });
    }
};

export const updateProfile = async (req, res) => {
    try {
        const { username, email } = req.body;
        const updates = {};

        // Validate username
        if (username) {
            if (username.length < 3 || username.length > 30) {
                return res.status(400).json({
                    success: false,
                    message: 'Kullanıcı adı 3-30 karakter arasında olmalıdır'
                });
            }
            updates.username = username;
        }

        // Validate email
        if (email) {
            const emailRegex = /^\S+@\S+\.\S+$/;
            if (!emailRegex.test(email)) {
                return res.status(400).json({
                    success: false,
                    message: 'Geçerli bir email adresi giriniz'
                });
            }
            updates.email = email.toLowerCase();
        }

        // Check if email already exists
        if (email) {
            const existingUser = await User.findOne({
                email: updates.email,
                _id: { $ne: req.user.id }
            });
            if (existingUser) {
                return res.status(400).json({
                    success: false,
                    message: 'Bu email adresi başka bir kullanıcı tarafından kullanılıyor'
                });
            }
        }

        const updatedUser = await User.findByIdAndUpdate(
            req.user.id,
            updates,
            { new: true, runValidators: true }
        ).select('-password -refreshToken');

        res.status(200).json({
            success: true,
            data: updatedUser,
            message: 'Profil başarıyla güncellendi'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Profil güncellenirken bir hata oluştu'
        });
    }
};

export const changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        // Validate request body
        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                message: 'Mevcut şifre ve yeni şifre zorunludur'
            });
        }

        // Get user with password
        const user = await User.findById(req.user.id).select('+password');

        // Verify current password
        const isMatch = await user.comparePassword(currentPassword);
        if (!isMatch) {
            return res.status(400).json({
                success: false,
                message: 'Mevcut şifre yanlış'
            });
        }

        // Validate new password
        if (!validatePassword(newPassword)) {
            return res.status(400).json({
                success: false,
                message: 'Yeni şifre geçersiz. Şifre en az 8 karakter uzunluğunda olmalı ve en az bir büyük harf, bir küçük harf, bir rakam ve bir özel karakter içermelidir'
            });
        }

        // Update password
        user.password = newPassword;
        await user.save();

        res.status(200).json({
            success: true,
            message: 'Şifre başarıyla güncellendi'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Şifre güncellenirken bir hata oluştu'
        });
    }
};

// Admin: Tüm kullanıcıları listele
export const getAllUsers = async (req, res) => {
    try {
        // Hassas bilgileri hariç tut
        const users = await User.find()
            .select('-password -refreshToken')
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            data: users
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Kullanıcılar listelenirken bir hata oluştu'
        });
    }
};

// Admin: Tek kullanıcı detayı
export const getUserById = async (req, res) => {
    try {
        const user = await User.findById(req.params.id)
            .select('-password -refreshToken');

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Kullanıcı bulunamadı'
            });
        }

        res.status(200).json({
            success: true,
            data: user
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Kullanıcı bilgileri alınırken bir hata oluştu'
        });
    }
};

// Admin: Kullanıcı sil
export const deleteUser = async (req, res) => {
    try {
        // Admin kendisini silemesin
        if (req.params.id === req.user.id) {
            return res.status(400).json({
                success: false,
                message: 'Kendi hesabınızı silemezsiniz'
            });
        }

        const user = await User.findById(req.params.id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Kullanıcı bulunamadı'
            });
        }

        // Başka bir admini silmeye çalışıyorsa engelle
        if (user.role === 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Diğer admin kullanıcıları silemezsiniz'
            });
        }

        await User.findByIdAndDelete(req.params.id);

        res.status(200).json({
            success: true,
            message: 'Kullanıcı başarıyla silindi'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Kullanıcı silinirken bir hata oluştu'
        });
    }
};

// Admin: Kullanıcı rolünü güncelle
export const updateUserRole = async (req, res) => {
    try {
        const { role } = req.body;

        // Role validasyonu
        if (!['user', 'admin'].includes(role)) {
            return res.status(400).json({
                success: false,
                message: 'Geçersiz rol'
            });
        }

        // Admin kendisinin rolünü değiştiremesin
        if (req.params.id === req.user.id) {
            return res.status(400).json({
                success: false,
                message: 'Kendi rolünüzü değiştiremezsiniz'
            });
        }

        const user = await User.findById(req.params.id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Kullanıcı bulunamadı'
            });
        }

        // Başka bir adminin rolünü değiştirmeye çalışıyorsa engelle
        if (user.role === 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Diğer admin kullanıcıların rollerini değiştiremezsiniz'
            });
        }

        const updatedUser = await User.findByIdAndUpdate(
            req.params.id,
            { role },
            { new: true, runValidators: true }
        ).select('-password -refreshToken');

        res.status(200).json({
            success: true,
            data: updatedUser,
            message: 'Kullanıcı rolü başarıyla güncellendi'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Kullanıcı rolü güncellenirken bir hata oluştu'
        });
    }
};
