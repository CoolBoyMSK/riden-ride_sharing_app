import Joi from 'joi';

const paymentMethodIdSchema = Joi.string()
  .regex(/^[0-9a-fA-F]{24}$/)
  .required()
  .messages({
    'string.base': 'Payment Method ID must be a string',
    'string.empty': 'Payment Method ID is required',
    'any.required': 'Payment Method ID is required',
    'string.pattern.base': 'Invalid Payment Method ID format',
  });

const cardSchema = Joi.object({
  cardNumber: Joi.string().creditCard().required().messages({
    'string.base': 'Card number must be a string',
    'string.creditCard': 'Invalid card number format',
    'any.required': 'Card number is required',
  }),

  holderName: Joi.string().min(4).max(50).required().messages({
    'string.base': 'Holder name must be a string',
    'string.min': 'Holder name must be at least 4 characters long',
    'string.max': 'Holder name cannot exceed 50 characters',
    'any.required': 'Holder name is required',
  }),

  BankName: Joi.string().min(3).max(100).required().messages({
    'string.base': 'Bank name must be a string',
    'string.min': 'Bank name must be at least 3 characters long',
    'string.max': 'Bank name cannot exceed 100 characters',
    'any.required': 'Bank name is required',
  }),

  cvv: Joi.string()
    .pattern(/^\d{3,4}$/)
    .required()
    .messages({
      'string.pattern.base': 'CVV must be 3 or 4 digits',
      'any.required': 'CVV is required',
    }),

  expiryMonth: Joi.number().integer().min(1).max(12).required().messages({
    'number.base': 'Expiry month must be a number',
    'number.min': 'Expiry month must be at least 1',
    'number.max': 'Expiry month cannot be more than 12',
    'any.required': 'Expiry month is required',
  }),

  expiryYear: Joi.number()
    .integer()
    .min(new Date().getFullYear())
    .required()
    .messages({
      'number.base': 'Expiry year must be a number',
      'number.min': 'Expiry year cannot be in the past',
      'any.required': 'Expiry year is required',
    }),
});

export const addPaymentMethodSchema = Joi.object({
  type: Joi.string().valid('CARD').default('CARD').required().messages({
    'any.only': "Type must be 'CARD'",
    'any.required': 'Payment method type is required',
  }),

  isDefault: Joi.boolean().default(false),

  card: Joi.when('type', {
    is: 'CARD',
    then: cardSchema.required(),
    otherwise: Joi.forbidden(),
  }),
});

export const setDefaultPaymentSchema = Joi.object({
  paymentMethodId: paymentMethodIdSchema,
});

export const updatePaymentMethodSchema = Joi.object({
  paymentMethodId: paymentMethodIdSchema,
  card: cardSchema.required(),
});
