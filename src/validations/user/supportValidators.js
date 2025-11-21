import Joi from 'joi';
import { COMPLAIN_TYPES } from '../../enums/complainEnums.js';

const fileSchema = Joi.object({
  fieldname: Joi.string().valid('gallery').required(),
  originalname: Joi.string().required(),
  encoding: Joi.string().required(),
  mimetype: Joi.string().valid('image/jpeg', 'image/png').required(),
  buffer: Joi.any(), // or Joi.binary()
  size: Joi.number(),
});

export const validateComplainTicket = (data) => {
  const schema = Joi.object({
    type: Joi.string()
      .valid(...COMPLAIN_TYPES)
      .required()
      .messages({
        'any.required': '❌ Complaint type is required.',
        'any.only': `❌ Invalid complaint type. Must be one of: ${COMPLAIN_TYPES.join(', ')}.`,
      }),

    bookingId: Joi.string()
      .pattern(/^R-[A-Z0-9]{6}$/i)
      .required()
      .messages({
        'any.required': '❌ Booking ID is required.',
        'string.pattern.base':
          '❌ Booking ID must start with "R-" followed by 6 letters or digits (e.g., R-D0FCD6).',
      }),

    text: Joi.string().trim().min(10).max(1000).required(),

    files: Joi.array().items(fileSchema).optional(),
  });

  return schema.validateAsync(data, { abortEarly: false });
};
