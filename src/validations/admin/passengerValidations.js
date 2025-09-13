import Joi from 'joi';
import mongoose from 'mongoose';

export const validateToggleUpdateRequest = (body) => {
  const objectIdValidator = (value, helpers) => {
    if (!mongoose.Types.ObjectId.isValid(value)) {
      return helpers.error('any.invalid');
    }
    return value;
  };

  const schema = Joi.object({
    id: Joi.string()
      .required()
      .custom(objectIdValidator, 'ObjectId Validation'),
    status: Joi.string().valid('approved', 'rejected').required(),
  });

  return schema.validate(body, { abortEarly: false });
};
