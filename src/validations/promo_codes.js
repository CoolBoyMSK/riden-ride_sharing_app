// src/validations/promoCodeValidations.js
import Joi from 'joi';

const createPromoSchema = Joi.object({
  code: Joi.string()
    .alphanum()
    .length(8)
    .uppercase()
    .optional()
    .description(
      'Optional 8-char alphanumeric code; auto-generated if omitted',
    ),
  discount: Joi.number()
    .min(0)
    .max(100)
    .required()
    .description('Discount percentage between 0 and 100'),
  startsAt: Joi.date().iso().required().description('ISO-8601 start date/time'),
  endsAt: Joi.date()
    .iso()
    .required()
    .greater(Joi.ref('startsAt'))
    .description('ISO-8601 end date/time, must be after startsAt'),
  isActive: Joi.boolean().optional(),
});

const updatePromoSchema = Joi.object({
  code: Joi.string()
    .alphanum()
    .length(8)
    .uppercase()
    .optional()
    .description(
      'Optional 8-char alphanumeric code; auto-generated if omitted',
    ),
  discount: Joi.number()
    .min(0)
    .max(100)
    .description('Updated discount percentage'),
  startsAt: Joi.date().iso().description('Updated start date/time'),
  endsAt: Joi.date()
    .iso()
    .when('startsAt', {
      is: Joi.exist(),
      then: Joi.date().greater(Joi.ref('startsAt')),
    })
    .description('Updated end date/time'),
  isActive: Joi.boolean().description('Activate or deactivate'),
})
  .or('discount', 'startsAt', 'endsAt', 'isActive')
  .messages({
    'object.missing':
      'At least one of discount, startsAt, endsAt, or isActive must be provided',
  });

export const validateCreatePromoCode = (payload) =>
  createPromoSchema.validateAsync(payload);

export const validateUpdatePromoCode = (payload) =>
  updatePromoSchema.validateAsync(payload);
