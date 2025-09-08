import Joi from 'joi';

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
