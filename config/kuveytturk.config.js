// Kuveyt Türk Payment Gateway Configuration
import { join } from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// URL Configuration
const URL_CONFIG = {
    baseUrl: 'https://boatest.kuveytturk.com.tr',
    endpoints: {
        threeDPayGate: '/boa.virtualpos.services/Home/ThreeDModelPayGate',
        threeDProvisionGate: '/boa.virtualpos.services/Home/ThreeDModelProvisionGate'
    }
};

// Auth Configuration
const AUTH_CONFIG = {
    merchantId: process.env.KT_MERCHANT_ID,
    customerId: process.env.KT_CUSTOMER_ID,
    username: process.env.KT_USERNAME,
    password: process.env.KT_PASSWORD
};

// Callback URLs Configuration
const CALLBACK_CONFIG = {
    success: 'https://muhendislerticaret-backend.onrender.com/api/payments/callback/success',
    fail: 'https://muhendislerticaret-backend.onrender.com/api/payments/callback/fail'
};
// Helper functions for URL operations
const URL_HELPERS = {
    joinUrl(...parts) {
        return parts
            .map(part => part.replace(/^\/+|\/+$/g, ''))
            .filter(Boolean)
            .join('/');
    },

    createApiUrl(endpoint) {
        return this.joinUrl(URL_CONFIG.baseUrl, endpoint);
    },

    getThreeDPayGateUrl() {
        return this.createApiUrl(URL_CONFIG.endpoints.threeDPayGate);
    },

    getThreeDProvisionGateUrl() {
        return this.createApiUrl(URL_CONFIG.endpoints.threeDProvisionGate);
    }
};

// Export configuration
export const KuveytTurkConfig = {
    urls: URL_CONFIG,
    auth: AUTH_CONFIG,
    callbacks: CALLBACK_CONFIG,  // Callback URLs eklendi
    urlHelpers: URL_HELPERS,
    settings: {
        cacheTTL: parseInt(process.env.PAYMENT_CACHE_TTL || '300'),
        maxAttempts: parseInt(process.env.MAX_PAYMENT_ATTEMPTS || '3'),
        timeout: parseInt(process.env.PAYMENT_TIMEOUT || '300000')
    },

    // Validate required environment variables
    validateConfig() {
        const requiredEnvVars = [
            'KT_MERCHANT_ID',
            'KT_CUSTOMER_ID',
            'KT_USERNAME',
            'KT_PASSWORD'
        ];

        const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

        if (missingVars.length > 0) {
            throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
        }

        // Validate numeric settings
        if (isNaN(this.settings.cacheTTL)) {
            throw new Error('Invalid PAYMENT_CACHE_TTL value');
        }
        if (isNaN(this.settings.maxAttempts)) {
            throw new Error('Invalid MAX_PAYMENT_ATTEMPTS value');
        }
        if (isNaN(this.settings.timeout)) {
            throw new Error('Invalid PAYMENT_TIMEOUT value');
        }
    }
};

// Run validation
KuveytTurkConfig.validateConfig();

// Export default
export default KuveytTurkConfig;
