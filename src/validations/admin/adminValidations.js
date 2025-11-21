import Joi from 'joi';
import { ADMIN_MODULES } from '../../enums/adminEnums.js';

const createAdminSchema = Joi.object({
  name: Joi.string().trim().required(),
  email: Joi.string().email().required(),
  phoneNumber: Joi.string()
    .pattern(/^[0-9+\-\s]{7,20}$/)
    .optional()
    .messages({ 'string.pattern.base': 'Invalid phone number format' }),
  password: Joi.string().min(8).required(),
  profileImg: Joi.string().uri().optional(),
  modules: Joi.array()
    .items(Joi.string().valid(...ADMIN_MODULES))
    .min(1)
    .required()
    .messages({
      'array.base': 'Modules must be an array',
      'any.only': 'Each module must be one of the allowed values',
      'array.min': 'At least one module must be assigned',
    }),
});

export const validateCreateAdmin = (payload) =>
  createAdminSchema.validateAsync(payload, { abortEarly: false });

export const validateUpdateAdmin = (payload) =>
  Joi.object({
    name: Joi.string().trim().optional(),
    email: Joi.string().email().optional(),
    password: Joi.string().min(8).optional(),
    profileImg: Joi.string().uri().optional(),
    phoneNumber: Joi.string()
      .pattern(/^[0-9+\-\s]{7,20}$/)
      .optional()
      .messages({ 'string.pattern.base': 'Invalid phone number format' }),
    modules: Joi.array()
      .items(Joi.string().valid(...ADMIN_MODULES))
      .optional()
      .messages({ 'array.base': 'Modules must be an array' }),
  })
    .min(1)
    .validateAsync(payload, { abortEarly: false });
