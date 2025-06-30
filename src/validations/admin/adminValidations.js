import Joi from 'joi';

const createAdminSchema = Joi.object({
  name: Joi.string().trim().required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  profileImg: Joi.string().uri().optional(),
});

export const validateCreateAdmin = (payload) =>
  createAdminSchema.validateAsync(payload, { abortEarly: false });
