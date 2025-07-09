import Joi from 'joi';

export const validateSignup = (body) => {
  const schema = Joi.object({
    name: Joi.string().trim().min(2).max(100).required(),
    email: Joi.string().email().required(),
    phoneNumber: Joi.string()
      .pattern(/^[0-9+\- ]{7,20}$/)
      .required(),
    password: Joi.string().min(8).max(128).required(),
    type: Joi.array()
      .items(Joi.string().valid('passenger', 'driver'))
      .optional(),
  });
  return schema.validateAsync(body);
};

const resetSchema = Joi.object({
  newPassword: Joi.string().min(8).max(128).required(),
});

export const validateResetPassword = (body) => resetSchema.validateAsync(body);

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).max(128).required(),
});

export const validateLogin = (payload) => loginSchema.validateAsync(payload);
