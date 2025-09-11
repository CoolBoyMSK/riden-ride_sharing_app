import Joi from 'joi';
import { DAYS_OF_WEEK } from '../../enums/weekDays.js';
import { CAR_TYPES } from '../../enums/carType.js';

const dailyFareSchema = Joi.object({
  day: Joi.string()
    .valid(...DAYS_OF_WEEK)
    .required(),
  baseFare: Joi.number().min(0).required(),
  perKmFare: Joi.number().min(0).required(),
  waiting: Joi.object({
    minutes: Joi.number().integer().min(0).required(),
    charge: Joi.number().min(0).required(),
  }).required(),
  nightTime: Joi.object({
    from: Joi.string()
      .pattern(/^\d{2}:\d{2}$/)
      .required(),
    to: Joi.string()
      .pattern(/^\d{2}:\d{2}$/)
      .required(),
  }).required(),
  nightCharge: Joi.number().min(0).required(),
  peakCharge: Joi.number().min(0).required(),
});

export const createFareManagementValidation = async (body) => {
  const schema = Joi.object({
    carType: Joi.string()
      .valid(...CAR_TYPES)
      .required(),
    dailyFares: Joi.array()
      .items(dailyFareSchema)
      .length(DAYS_OF_WEEK.length)
      .required(),
  });
  await schema.validateAsync(body, { abortEarly: false });
};

export const updateFareManagementValidation = createFareManagementValidation;

export const updateDailyFareValidation = async ({
  carType,
  day,
  dailyFares,
}) => {
  const schema = Joi.object({
    carType: Joi.string()
      .valid(...CAR_TYPES)
      .required(),
    day: Joi.string()
      .valid(...DAYS_OF_WEEK)
      .insensitive()
      .required(),
    partialDailyFare: Joi.object({
      baseFare: Joi.number().min(0),
      perKmFare: Joi.number().min(0),
      waiting: Joi.object({
        minutes: Joi.number().integer().min(0),
        charge: Joi.number().min(0),
      }),
      nightTime: Joi.object({
        from: Joi.string().pattern(/^\d{2}:\d{2}$/),
        to: Joi.string().pattern(/^\d{2}:\d{2}$/),
      }),
      nightCharge: Joi.number().min(0),
      peakCharge: Joi.number().min(0),
    })
      .min(1)
      .required(),
  });
  await schema.validateAsync(
    { carType, day, dailyFares, partialDailyFare },
    { abortEarly: false },
  );
};
