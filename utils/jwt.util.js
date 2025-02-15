import jwt from 'jsonwebtoken';

export const createTokens = async (user) => {
    const accessToken = jwt.sign(
        {
            id: user._id,
            role: user.role,
            iat: Math.floor(Date.now() / 1000)
        },
        process.env.JWT_ACCESS_SECRET,
        { expiresIn: '15m' }
    );

    const refreshToken = jwt.sign(
        {
            id: user._id,
            iat: Math.floor(Date.now() / 1000)
        },
        process.env.JWT_REFRESH_SECRET,
        { expiresIn: '7d' }
    );

    user.refreshToken = refreshToken;
    await user.save();

    // Token sürelerini hesapla
    const accessTokenExpiry = Date.now() + (15 * 60 * 1000); // 15 dakika
    const refreshTokenExpiry = Date.now() + (7 * 24 * 60 * 60 * 1000); // 7 gün

    return {
        accessToken,
        refreshToken,
        accessTokenExpiry,
        refreshTokenExpiry
    };
};

export const setTokenCookies = (res, { accessToken, refreshToken }) => {
    const cookieOptions = {
        httpOnly: true,
        secure: true, // HTTPS gerekli
        sameSite: 'none', // Cross-site isteklere izin ver
        maxAge: 15 * 60 * 1000,
        path: '/' // Tüm path'lerde geçerli olsun
    };

    res.cookie('access_token', accessToken, cookieOptions);
    res.cookie('refresh_token', refreshToken, {
        ...cookieOptions,
        maxAge: 7 * 24 * 60 * 60 * 1000
    });
};

export const clearTokenCookies = (res) => {
    res.cookie('access_token', '', { maxAge: 0 });
    res.cookie('refresh_token', '', { maxAge: 0 });
};

// Yeni eklenen token kontrol fonksiyonları
export const decodeToken = (token) => {
    try {
        return jwt.decode(token);
    } catch (error) {
        return null;
    }
};

export const getTokenExpirationTime = (token) => {
    const decoded = decodeToken(token);
    if (!decoded || !decoded.exp) return 0;
    return decoded.exp * 1000; // Unix timestamp'i milisaniyeye çevirme
};

export const shouldRefreshToken = (token) => {
    const expirationTime = getTokenExpirationTime(token);
    const currentTime = Date.now();
    const timeUntilExpiration = expirationTime - currentTime;

    // Token'ın süresinin dolmasına 1 dakika kala yenileme yap
    return timeUntilExpiration < 60000;
};
