import Joi from 'joi';
import { ADMIN_MODULES } from '../../enums/adminModules.js';

const createAdminSchema = Joi.object({
  name: Joi.string().trim().required(),
  email: Joi.string().email().required(),
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
