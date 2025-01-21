// controllers/auth.controller.js
import { User } from '../models/user.model.js';
import jwt from 'jsonwebtoken';
import { createTokens, setTokenCookies, clearTokenCookies } from '../utils/jwt.util.js';

const authController = {
    async register(req, res) {
        try {
            const { username, email, password } = req.body;

            const existingUser = await User.findOne({
                $or: [{ email }, { username }]
            });

            if (existingUser) {
                return res.status(400).json({
                    success: false,
                    message: 'Bu email veya kullanıcı adı zaten kullanımda'
                });
            }

            const user = new User({
                username,
                email,
                password
            });

            await user.save();

            const tokens = await createTokens(user);
            setTokenCookies(res, tokens);

            res.status(201).json({
                success: true,
                message: 'Kayıt başarıyla tamamlandı',
                expiresIn: 900, // 15 dakika (saniye cinsinden)
                accessTokenExpiry: tokens.accessTokenExpiry,
                refreshTokenExpiry: tokens.refreshTokenExpiry
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    },

    async login(req, res) {
        try {
            const { email, password } = req.body;

            const user = await User.findOne({ email }).select('+password');

            if (!user || !(await user.comparePassword(password))) {
                return res.status(401).json({
                    success: false,
                    message: 'Geçersiz email veya şifre'
                });
            }

            user.lastLogin = new Date();
            await user.save();

            const tokens = await createTokens(user);
            setTokenCookies(res, tokens);

            res.json({
                success: true,
                message: 'Giriş başarılı',
                expiresIn: 900, // 15 dakika (saniye cinsinden)
                accessTokenExpiry: tokens.accessTokenExpiry,
                refreshTokenExpiry: tokens.refreshTokenExpiry
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    },

    async logout(req, res) {
        try {
            if (req.user) {
                await User.findByIdAndUpdate(req.user.id, {
                    refreshToken: null
                });
            }

            clearTokenCookies(res);

            res.json({
                success: true,
                message: 'Çıkış başarılı'
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    },

    async refreshToken(req, res) {
        try {
            const refreshToken = req.cookies.refresh_token;

            if (!refreshToken) {
                return res.status(401).json({
                    success: false,
                    message: 'Refresh token bulunamadı'
                });
            }

            const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
            const user = await User.findById(decoded.id);

            if (!user || user.refreshToken !== refreshToken) {
                return res.status(401).json({
                    success: false,
                    message: 'Geçersiz refresh token'
                });
            }

            const tokens = await createTokens(user);
            setTokenCookies(res, tokens);

            res.json({
                success: true,
                message: 'Token başarıyla yenilendi',
                expiresIn: 900, // 15 dakika (saniye cinsinden)
                accessTokenExpiry: tokens.accessTokenExpiry,
                refreshTokenExpiry: tokens.refreshTokenExpiry
            });
        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                return res.status(401).json({
                    success: false,
                    message: 'Refresh token süresi dolmuş'
                });
            }

            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    },

    async checkAuth(req, res) {
        try {
            if (!req.user) {
                return res.status(401).json({
                    success: false,
                    message: 'Yetkilendirme başarısız'
                });
            }

            const { accessTokenExpiry, refreshTokenExpiry } = res.locals.tokenExpiry;

            return res.json({
                success: true,
                message: 'Token geçerli',
                user: {
                    id: req.user._id,
                    role: req.user.role
                },
                expiresIn: Math.floor((accessTokenExpiry - Date.now()) / 1000),
                accessTokenExpiry,
                refreshTokenExpiry
            });
        } catch (error) {
            console.error('CheckAuth Error:', error);
            return res.status(401).json({
                success: false,
                message: 'Yetkilendirme başarısız'
            });
        }
    }
};


export default authController;