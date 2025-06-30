import Joi from 'joi';

const loginSchema = Joi.object({
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
