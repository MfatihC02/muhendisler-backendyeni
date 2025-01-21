// middleware/auth.middleware.js
import jwt from 'jsonwebtoken';
import { User } from '../models/user.model.js';
import { createTokens, setTokenCookies } from '../utils/jwt.util.js';

export const verifyToken = async (req, res, next) => {
    try {
        const token = req.cookies.access_token;

        if (!token) {
            console.log('Access token bulunamadı, refresh token kontrolüne geçiliyor');
            return handleRefreshToken(req, res, next);
        }

        try {
            const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
            const user = await User.findById(decoded.id);

            if (!user) {
                console.log('Kullanıcı bulunamadı');
                return res.status(401).json({
                    success: false,
                    message: 'Kullanıcı bulunamadı'
                });
            }

            if (!user.isActive) {
                console.log('Kullanıcı aktif değil');
                return res.status(401).json({
                    success: false,
                    message: 'Hesap aktif değil'
                });
            }

            const expirationTime = decoded.exp * 1000;
            const currentTime = Date.now();

            if (expirationTime - currentTime <= 300000) {
                console.log('Token yenileniyor');
                return handleRefreshToken(req, res, next);
            }

            req.user = user;
            res.locals.tokenExpiry = {
                accessTokenExpiry: expirationTime,
                refreshTokenExpiry: getRefreshTokenExpiry(req.cookies.refresh_token)
            };
            next();
        } catch (error) {
            console.log('Token doğrulama hatası:', error.message);
            if (error.name === 'TokenExpiredError') {
                return handleRefreshToken(req, res, next);
            }
            return res.status(401).json({
                success: false,
                message: 'Geçersiz token'
            });
        }
    } catch (error) {
        console.error('Beklenmeyen hata:', error);
        return res.status(500).json({
            success: false,
            message: 'Sunucu hatası'
        });
    }
};

const handleRefreshToken = async (req, res, next) => {
    try {
        const refreshToken = req.cookies.refresh_token;

        if (!refreshToken) {
            return res.status(401).json({
                success: false,
                message: 'Oturum süresi doldu, lütfen tekrar giriş yapın'
            });
        }

        const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
        const user = await User.findById(decoded.id);

        if (!user || !user.isActive) {
            return res.status(401).json({
                success: false,
                message: 'Geçersiz oturum'
            });
        }

        // Token oluşturma işlemini await ile bekle
        const tokens = await createTokens(user);
        
        // Token'ları cookie'lere kaydet
        setTokenCookies(res, tokens);

        req.user = user;
        res.locals.tokenExpiry = {
            accessTokenExpiry: tokens.accessTokenExpiry,
            refreshTokenExpiry: tokens.refreshTokenExpiry
        };

        next();
    } catch (error) {
        console.error('Refresh token hatası:', error);
        return res.status(401).json({
            success: false,
            message: 'Token yenileme başarısız'
        });
    }
};

const getRefreshTokenExpiry = (refreshToken) => {
    try {
        const decoded = jwt.decode(refreshToken);
        return decoded ? decoded.exp * 1000 : null;
    } catch {
        return null;
    }
};

// Rol kontrolü için genel middleware
export const checkRole = (roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Yetkilendirme gerekli'
            });
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: 'Bu işlem için yetkiniz yok'
            });
        }

        next();
    };
};

// Admin kontrolü için middleware
export const isAdmin = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            message: 'Yetkilendirme gerekli'
        });
    }

    if (req.user.role !== 'admin') {
        return res.status(403).json({
            success: false,
            message: 'Bu işlem için admin yetkisi gerekli'
        });
    }

    next();
};

// Satıcı kontrolü için middleware
export const isSeller = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            message: 'Yetkilendirme gerekli'
        });
    }

    if (req.user.role !== 'seller' && req.user.role !== 'admin') {
        return res.status(403).json({
            success: false,
            message: 'Bu işlem için satıcı yetkisi gerekli'
        });
    }

    next();
};

// Müşteri kontrolü için middleware
export const isCustomer = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            message: 'Yetkilendirme gerekli'
        });
    }

    if (req.user.role !== 'customer' && req.user.role !== 'admin') {
        return res.status(403).json({
            success: false,
            message: 'Bu işlem için müşteri yetkisi gerekli'
        });
    }

    next();
};