import Joi from 'joi';
import mongoose from 'mongoose';

const objectId = () =>
  Joi.string().custom((value, helpers) => {
    if (!mongoose.Types.ObjectId.isValid(value)) {
      return helpers.error('any.invalid');
    }
    return value;
  }, 'ObjectId validation');

// --- Add Address Schema ---
export const addAddressSchema = Joi.object({
  title: Joi.string().trim().min(2).max(50).required().messages({
    'string.base': 'Title must be a string',
    'string.empty': 'Title cannot be empty',
    'string.min': 'Title must be at least 2 characters long',
    'string.max': 'Title must not exceed 50 characters',
    'any.required': 'Title is required',
  }),

  long: Joi.number().min(-180).max(180).required().messages({
    'number.base': 'Longitude must be a number',
    'number.min': 'Longitude cannot be less than -180',
    'number.max': 'Longitude cannot be more than 180',
    'any.required': 'Longitude is required',
  }),

  lat: Joi.number().min(-90).max(90).required().messages({
    'number.base': 'Latitude must be a number',
    'number.min': 'Latitude cannot be less than -90',
    'number.max': 'Latitude cannot be more than 90',
    'any.required': 'Latitude is required',
  }),
});

// --- Update Address Schema ---
export const updateAddressSchema = Joi.object({
  addressId: objectId().required().messages({
    'any.required': 'Address ID is required',
    'any.invalid': 'Invalid address ID format',
  }),

  title: Joi.string().trim().min(2).max(50).optional().messages({
    'string.base': 'Title must be a string',
    'string.empty': 'Title cannot be empty',
    'string.min': 'Title must be at least 2 characters long',
    'string.max': 'Title must not exceed 50 characters',
  }),

  long: Joi.number().min(-180).max(180).optional().messages({
    'number.base': 'Longitude must be a number',
    'number.min': 'Longitude cannot be less than -180',
    'number.max': 'Longitude cannot be more than 180',
  }),

  lat: Joi.number().min(-90).max(90).optional().messages({
    'number.base': 'Latitude must be a number',
    'number.min': 'Latitude cannot be less than -90',
    'number.max': 'Latitude cannot be more than 90',
  }),
})
  .or('title', 'long', 'lat')
  .messages({
    'object.missing':
      'At least one field (title, long, or lat) must be provided to update',
  });

// --- Delete Address Schema ---
export const deleteAddressSchema = Joi.object({
  addressId: objectId().required().messages({
    'any.required': 'Address ID is required',
    'any.invalid': 'Invalid address ID format',
  }),
});
