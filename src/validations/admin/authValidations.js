import Joi from 'joi';

export const loginSchema = Joi.object({
  email: Joi.string()
    .email({ tlds: { allow: false } })
    .required()
    .messages({
      'string.empty': 'Email is required',
      'string.email': 'Must be a valid email',
    }),
  password: Joi.string().min(8).required().messages({
    'string.empty': 'Password is required',
    'string.min': 'Password must be at least 8 characters',
  }),
});

export const validateAdminLogin = (payload) =>
  loginSchema.validateAsync(payload, { abortEarly: false });

export const validateRefresh = (payload) =>
  Joi.object({
    refreshToken: Joi.string().required().messages({
      'string.empty': 'refreshToken is required',
    }),
  }).validateAsync(payload, { abortEarly: false });

export const validateRequestReset = (payload) =>
  Joi.object({
    email: Joi.string().email().required().messages({
      'string.empty': 'Email is required',
      'string.email': 'Must be a valid email',
    }),
  }).validateAsync(payload, { abortEarly: false });

export const validateConfirmReset = (payload) =>
  Joi.object({
    token: Joi.string()
      .required()
      .messages({ 'string.empty': 'Token is required' }),
    newPassword: Joi.string().min(8).required().messages({
      'string.empty': 'New password is required',
      'string.min': 'Password must be at least 8 characters',
    }),
  }).validateAsync(payload, { abortEarly: false });
