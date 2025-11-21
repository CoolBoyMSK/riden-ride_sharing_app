import Joi from 'joi';
import { CAR_TYPES } from '../enums/vehicleEnums.js';

export async function upsertVehicleValidation(body) {
  const schema = Joi.object({
    type: Joi.string()
      .valid(...CAR_TYPES)
      .required(),
    model: Joi.string().trim().required(),
    plateNumber: Joi.string().trim().required(),
    color: Joi.string().trim().required(),
  });
  await schema.validateAsync(body, { abortEarly: false });
}

export async function patchVehicleValidation(body) {
  const schema = Joi.object({
    type: Joi.string().valid(...CAR_TYPES),
    model: Joi.string().trim(),
    plateNumber: Joi.string().trim(),
    color: Joi.string().trim(),
    imageUrl: Joi.string().uri().optional(),
  }).min(1);
  await schema.validateAsync(body, { abortEarly: false });
}
