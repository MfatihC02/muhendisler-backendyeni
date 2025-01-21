import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { validatePassword } from '../utils/password.util.js';

const UserSchema = new mongoose.Schema({
    username: {
        type: String,
        required: [true, 'Kullanıcı adı zorunludur'],
        unique: true,
        trim: true,
        minlength: [3, 'Kullanıcı adı en az 3 karakter olmalıdır'],
        maxlength: [30, 'Kullanıcı adı en fazla 30 karakter olabilir']
    },
    email: {
        type: String,
        required: [true, 'Email zorunludur'],
        unique: true,
        trim: true,
        lowercase: true,
        match: [/^\S+@\S+\.\S+$/, 'Geçerli bir email adresi giriniz']
    },
    password: {
        type: String,
        required: [true, 'Şifre zorunludur'],
        minlength: [8, 'Şifre en az 8 karakter olmalıdır'],
        validate: {
            validator: validatePassword,
            message: 'Şifre en az bir büyük harf, bir küçük harf, bir rakam ve bir özel karakter içermelidir'
        },
        select: false
    },
    role: {
        type: String,
        enum: ['user', 'admin'],
        default: 'user'
    },
    isActive: {
        type: Boolean,
        default: true
    },
    lastLogin: {
        type: Date,
        default: null
    },
    refreshToken: {
        type: String,
    }
}, {
    timestamps: true
});

UserSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();

    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

UserSchema.methods.comparePassword = async function (candidatePassword) {
    try {
        return await bcrypt.compare(candidatePassword, this.password);
    } catch (error) {
        throw error;
    }
};

const User = mongoose.model('User', UserSchema);
export { User };