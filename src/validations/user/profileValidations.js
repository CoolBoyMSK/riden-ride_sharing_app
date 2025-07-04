import Joi from 'joi';

export const validateProfileUpdate = (body) =>
  Joi.object({
    name: Joi.string().trim().min(2).max(100),
    email: Joi.string().email(),
    phoneNumber: Joi.string()
      .pattern(/^[0-9+\- ]{7,20}$/)
      .message('phoneNumber must be a valid phone'),
  })
    .or('name', 'email', 'phoneNumber')
    .messages({
      'object.missing':
        'At least one of name, email or phoneNumber must be provided',
    })
    .validateAsync(body);
