import Joi from 'joi';
import PAYMENT_METHODS from '../../../enums/paymentMethods.js';
import CARD_BRANDS from '../../../enums/cardBrands.js';
import WALLET_PROVIDERS from '../../../enums/walletProviders.js';

const cardSchema = Joi.object({
  cardToken: Joi.string().trim().required(),
  last4: Joi.string().length(4).pattern(/^\d+$/).required(),
  cardBrand: Joi.string()
    .valid(...CARD_BRANDS)
    .required(),
  expiryMonth: Joi.number().integer().min(1).max(12).required(),
  expiryYear: Joi.number().integer().min(new Date().getFullYear()).required(),
});

const walletSchema = Joi.object({
  walletId: Joi.string().trim().required(),
  walletProvider: Joi.string()
    .valid(...WALLET_PROVIDERS)
    .required(),
});

export const addPaymentMethodSchema = Joi.object({
  type: Joi.string()
    .valid(...PAYMENT_METHODS)
    .required(),

  isDefault: Joi.boolean().default(false),

  card: Joi.when('type', {
    is: 'CARD',
    then: cardSchema.required(),
    otherwise: Joi.forbidden(),
  }),

  wallet: Joi.when('type', {
    is: 'WALLET',
    then: walletSchema.required(),
    otherwise: Joi.forbidden(),
  }),
});

export const setDefaultPaymentSchema = Joi.object({
  paymentMethodId: Joi.string()
    .required()
    .regex(/^[0-9a-fA-F]{24}$/)
    .messages({
      'string.base': 'Payment Method ID must be a string',
      'string.empty': 'Payment Method ID is required',
      'any.required': 'Payment Method ID is required',
      'string.pattern.base': 'Invalid Payment Method ID format',
    }),
});
