import Joi from 'joi';
import mongoose from 'mongoose';
import { ALLOWED_SETTINGS } from '../enums/userSettings.js';

export const validateNotificationSettingName = (data) => {
  const schema = Joi.object({
    type: Joi.string()
      .valid(...ALLOWED_SETTINGS)
      .required()
      .messages({
        'any.only': `Invalid setting name. Allowed values: ${ALLOWED_SETTINGS.join(', ')}.`,
        'string.base': 'Setting name must be a string.',
        'any.required': 'Setting name is required.',
      }),
  }).unknown(false);

  return schema.validate(data, { abortEarly: false });
};

export const validateObjectId = (data) => {
  const schema = Joi.object({
    id: Joi.string()
      .custom((value, helpers) => {
        if (!mongoose.Types.ObjectId.isValid(value)) {
          return helpers.error('any.invalid');
        }
        return value;
      }, 'ObjectId Validation')
      .required()
      .messages({
        'any.required': 'Object ID is required.',
        'any.invalid': 'Invalid Object ID format.',
        'string.base': 'Object ID must be a string.',
      }),
  }).unknown(false);

  return schema.validate(data, { abortEarly: false });
};
