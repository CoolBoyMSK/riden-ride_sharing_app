import Joi from 'joi';
import { DOCUMENT_STATUS } from '../enums/driver.js';

const suspensionSchema = Joi.object({
  reason: Joi.string().min(5).max(256).required(),
  endDate: Joi.date().iso().greater('now').required(),
});

export const validateDriverSuspension = (body) =>
  suspensionSchema.validateAsync(body);

export const validateDocTypeParam = (params) => {
  const schema = Joi.object({
    docType: Joi.string()
      .valid(
        'proofOfWork',
        'profilePicture',
        'driversLicense',
        'commercialDrivingRecord',
        'vehicleOwnerCertificateAndInsurance',
        'vehicleInspection',
      )
      .required(),
  });
  return schema.validateAsync(params);
};

export const validateDocUpdate = (params) => {
  const schema = Joi.object({
    docType: Joi.string()
      .valid(
        'proofOfWork',
        'profilePicture',
        'driversLicense',
        'commercialDrivingRecord',
        'vehicleOwnerCertificateAndInsurance',
        'vehicleInspection',
      )
      .required()
      .messages({
        'any.only': 'Invalid docType provided',
        'string.base': 'docType must be a string',
        'any.required': 'docType is required',
      }),

    status: Joi.string()
      .valid(...DOCUMENT_STATUS)
      .required()
      .messages({
        'any.only': `status must be one of: ${DOCUMENT_STATUS.join(', ')}`,
        'string.base': 'status must be a string',
        'any.required': 'status is required',
      }),
  });

  return schema.validateAsync(params);
};
