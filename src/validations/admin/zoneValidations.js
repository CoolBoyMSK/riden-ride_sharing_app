import Joi from 'joi';

const coordinateSchema = Joi.array()
  .items(Joi.number().min(-180).max(180), Joi.number().min(-90).max(90))
  .length(2)
  .required()
  .messages({
    'array.base': 'Coordinate must be an array',
    'array.length': 'Coordinate must contain exactly 2 values [longitude, latitude]',
    'number.min': 'Longitude must be between -180 and 180, latitude between -90 and 90',
    'number.max': 'Longitude must be between -180 and 180, latitude between -90 and 90',
  });

const createAirportParkingSchema = Joi.object({
  airportId: Joi.string()
    .required()
    .messages({ 'string.empty': 'Airport ID is required' }),
  name: Joi.string().trim().min(3).optional().messages({
    'string.min': 'Parking name must be at least 3 characters long',
  }),
  coordinates: Joi.array()
    .items(coordinateSchema)
    .length(4)
    .required()
    .messages({
      'array.base': 'Coordinates must be an array',
      'array.length': 'Exactly 4 coordinates are required for parking area',
      'any.required': 'Coordinates are required',
    }),
  description: Joi.string().trim().max(500).optional().messages({
    'string.max': 'Description cannot exceed 500 characters',
  }),
  isActive: Joi.boolean().optional(),
});

export const validateCreateAirportParking = (payload) =>
  createAirportParkingSchema.validateAsync(payload, { abortEarly: false });


