import Joi from 'joi';

export const addToCartSchema = Joi.object({
    productId: Joi.string()
        .required()
        .messages({
            'string.empty': 'Ürün ID boş olamaz',
            'any.required': 'Ürün ID gerekli'
        }),
    quantity: Joi.number()
        .min(1)
        .required()
        .messages({
            'number.base': 'Miktar sayı olmalıdır',
            'number.min': 'Miktar en az 1 olmalıdır',
            'any.required': 'Miktar gerekli'
        })
});

export const updateCartItemSchema = Joi.object({
    quantity: Joi.number()
        .min(1)
        .required()
        .messages({
            'number.base': 'Miktar sayı olmalıdır',
            'number.min': 'Miktar en az 1 olmalıdır',
            'any.required': 'Miktar gerekli'
        })
});
