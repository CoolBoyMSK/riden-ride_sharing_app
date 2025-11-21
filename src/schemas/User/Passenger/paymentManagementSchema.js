import Joi from 'joi';

const paymentMethodIdSchema = Joi.string()
  .pattern(/^pm_[a-zA-Z0-9]+$/)
  .required()
  .messages({
    'string.base': 'Payment Method ID must be a string',
    'string.empty': 'Payment Method ID is required',
    'any.required': 'Payment Method ID is required',
    'string.pattern.base': 'Invalid Stripe Payment Method ID format',
  });

// Card validation schema
const cardSchema = Joi.object({
  number: Joi.string().creditCard().required().messages({
    'string.creditCard': 'Card number must be valid',
    'any.required': 'Card number is required',
  }),
  exp_month: Joi.number().integer().min(1).max(12).required().messages({
    'any.required': 'Expiration month is required',
    'number.base': 'Expiration month must be a number',
  }),
  exp_year: Joi.number()
    .integer()
    .min(new Date().getFullYear())
    .max(new Date().getFullYear() + 15) // up to 15 years in future
    .required()
    .messages({
      'any.required': 'Expiration year is required',
      'number.base': 'Expiration year must be a number',
    }),
  cvc: Joi.string()
    .pattern(/^\d{3,4}$/)
    .required()
    .messages({
      'string.pattern.base': 'CVC must be 3 or 4 digits',
      'any.required': 'CVC is required',
    }),
});

// Billing details validation schema
const billingDetailsSchema = Joi.object({
  name: Joi.string().min(2).max(100).required().messages({
    'any.required': 'Billing name is required',
    'string.min': 'Name must be at least 2 characters',
  }),
  email: Joi.string().email().required().messages({
    'any.required': 'Billing email is required',
    'string.email': 'Must be a valid email address',
  }),
});

// Final schema
export const addPaymentMethodSchema = Joi.object({
  type: Joi.string()
    .valid('card', 'google_pay', 'apple_pay')
    .default('card')
    .required()
    .messages({
      'any.only': "Type must be 'card', 'google_pay', or 'apple_pay'",
      'any.required': 'Payment method type is required',
    }),

  isDefault: Joi.boolean().default(false),

  // For Google Pay and Apple Pay, payment method ID is provided directly
  paymentMethodId: Joi.when('type', {
    is: Joi.string().valid('google_pay', 'apple_pay'),
    then: paymentMethodIdSchema.required(),
    otherwise: Joi.forbidden(),
  }),

  // For card, card details are required
  card: Joi.when('type', {
    is: 'card',
    then: cardSchema.required(),
    otherwise: Joi.forbidden(),
  }),

  billing_details: Joi.when('type', {
    is: 'card',
    then: billingDetailsSchema.required(),
    otherwise: Joi.forbidden(),
  }),
});

export const setDefaultPaymentSchema = Joi.object({
  paymentMethodId: paymentMethodIdSchema,
});

const addressSchema = Joi.object({
  line1: Joi.string().max(200).optional(),
  city: Joi.string().max(100).optional(),
  state: Joi.string().max(100).optional(),
  postal_code: Joi.string().max(20).optional(),
  country: Joi.string().length(2).optional(), // 2-letter country code
}).optional();

// Billing details schema (all optional)
const updatebillingDetailsSchema = Joi.object({
  name: Joi.string().min(2).max(100).optional(),
  email: Joi.string().email().optional(),
  address: addressSchema,
}).optional();

// Metadata schema (all optional, keys are flexible)
const metadataSchema = Joi.object()
  .pattern(
    Joi.string(),
    Joi.string().allow('', null), // allow empty string or null values
  )
  .optional();

// Final schema for updating card details
export const updateCardDetailsSchema = Joi.object({
  billing_details: updatebillingDetailsSchema,
  metadata: metadataSchema,
})
  .or('billing_details', 'metadata') // Require at least one if you want to enforce non-empty, otherwise remove this
  .messages({
    'object.missing':
      'At least one of billing_details or metadata must be provided',
  });

export const updatePaymentMethodSchema = Joi.object({
  paymentMethodId: paymentMethodIdSchema,
  card: updateCardDetailsSchema,
});
