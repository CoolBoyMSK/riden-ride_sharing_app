import Joi from 'joi';
import { CAR_TYPES } from '../../enums/carType.js';

// Location schema
const locationSchema = Joi.object({
  coordinates: Joi.array()
    .items(Joi.number().required())
    .length(2)
    .required()
    .messages({
      'array.length':
        'Coordinates must contain exactly 2 values [longitude, latitude]',
      'any.required': 'Coordinates are required',
    }),
  address: Joi.string().trim().max(500).required().messages({
    'string.max': 'Address cannot exceed 500 characters',
    'any.required': 'Address is required',
  }),
  placeName: Joi.string().trim().max(200).optional().allow('').messages({
    'string.max': 'Place name cannot exceed 200 characters',
  }),
});

// Validation for fare estimation
export const fareEstimateValidation = Joi.object({
  pickupLocation: locationSchema.required(),
  dropoffLocation: locationSchema.required(),
  carType: Joi.string()
    .valid(...CAR_TYPES)
    .required()
    .messages({
      'any.only': `Car type must be one of: ${CAR_TYPES.join(', ')}`,
      'any.required': 'Car type is required',
    }),
  promoCode: Joi.string().trim().uppercase().length(8).optional().messages({
    'string.length': 'Promo code must be exactly 8 characters',
  }),
});

// Validation for ride booking
export const rideBookingValidation = Joi.object({
  pickupLocation: locationSchema.required(),
  dropoffLocation: locationSchema.required(),
  carType: Joi.string()
    .valid(...CAR_TYPES)
    .required()
    .messages({
      'any.only': `Car type must be one of: ${CAR_TYPES.join(', ')}`,
      'any.required': 'Car type is required',
    }),
  paymentMethod: Joi.string()
    .valid('CARD', 'WALLET', 'CASH')
    .required()
    .messages({
      'any.only': 'Payment method must be CARD, WALLET, or CASH',
      'any.required': 'Payment method is required',
    }),
  promoCode: Joi.string().trim().uppercase().length(8).optional().messages({
    'string.length': 'Promo code must be exactly 8 characters',
  }),
  scheduledTime: Joi.date().iso().min('now').optional().messages({
    'date.min': 'Scheduled time cannot be in the past',
    'date.iso': 'Scheduled time must be a valid ISO date',
  }),
  specialRequests: Joi.string().trim().max(500).optional().allow('').messages({
    'string.max': 'Special requests cannot exceed 500 characters',
  }),
});

// Validation for ride cancellation
export const rideCancellationValidation = Joi.object({
  reason: Joi.string().trim().max(500).optional().allow('').messages({
    'string.max': 'Cancellation reason cannot exceed 500 characters',
  }),
});

// Validation for available car types request
export const availableCarTypesValidation = Joi.object({
  pickupLocation: locationSchema.required(),
});

// Validation for driver location update
export const driverLocationUpdateValidation = Joi.object({
  coordinates: Joi.array()
    .items(Joi.number().required())
    .length(2)
    .required()
    .messages({
      'array.length':
        'Coordinates must contain exactly 2 values [longitude, latitude]',
      'any.required': 'Coordinates are required',
    }),
  heading: Joi.number().min(0).max(360).optional().messages({
    'number.min': 'Heading must be between 0 and 360 degrees',
    'number.max': 'Heading must be between 0 and 360 degrees',
  }),
  speed: Joi.number().min(0).optional().messages({
    'number.min': 'Speed cannot be negative',
  }),
  accuracy: Joi.number().min(0).optional().messages({
    'number.min': 'Accuracy cannot be negative',
  }),
});

// Validation for ride completion (driver)
export const rideCompletionValidation = Joi.object({
  actualDistance: Joi.number().min(0).required().messages({
    'number.min': 'Actual distance cannot be negative',
    'any.required': 'Actual distance is required',
  }),
  waitingTime: Joi.number().min(0).optional().default(0).messages({
    'number.min': 'Waiting time cannot be negative',
  }),
});

// Validation for ride status update
export const rideStatusUpdateValidation = Joi.object({
  status: Joi.string()
    .valid(
      'DRIVER_ARRIVING',
      'DRIVER_ARRIVED',
      'RIDE_STARTED',
      'RIDE_IN_PROGRESS',
    )
    .required()
    .messages({
      'any.only': 'Invalid status transition',
      'any.required': 'Status is required',
    }),
  notes: Joi.string().trim().max(200).optional().allow('').messages({
    'string.max': 'Notes cannot exceed 200 characters',
  }),
});

// Validation for ride rating
export const rideRatingValidation = Joi.object({
  rating: Joi.number().integer().min(1).max(5).required().messages({
    'number.min': 'Rating must be between 1 and 5',
    'number.max': 'Rating must be between 1 and 5',
    'any.required': 'Rating is required',
  }),
  feedback: Joi.string().trim().max(500).optional().allow('').messages({
    'string.max': 'Feedback cannot exceed 500 characters',
  }),
});

// Validation for ride history request
export const rideHistoryValidation = Joi.object({
  page: Joi.number().integer().min(1).optional().default(1).messages({
    'number.min': 'Page must be at least 1',
  }),
  limit: Joi.number().integer().min(1).max(50).optional().default(10).messages({
    'number.min': 'Limit must be at least 1',
    'number.max': 'Limit cannot exceed 50',
  }),
  status: Joi.string()
    .valid(
      'RIDE_COMPLETED',
      'CANCELLED_BY_PASSENGER',
      'CANCELLED_BY_DRIVER',
      'CANCELLED_BY_SYSTEM',
    )
    .optional()
    .messages({
      'any.only': 'Invalid status filter',
    }),
});

// Validation for ride statistics request
export const rideStatsValidation = Joi.object({
  startDate: Joi.date().iso().optional().messages({
    'date.iso': 'Start date must be a valid ISO date',
  }),
  endDate: Joi.date().iso().min(Joi.ref('startDate')).optional().messages({
    'date.iso': 'End date must be a valid ISO date',
    'date.min': 'End date must be after start date',
  }),
});

// Validation for promo code validation request
export const promoCodeValidation = Joi.object({
  promoCode: Joi.string().trim().uppercase().length(8).required().messages({
    'string.length': 'Promo code must be exactly 8 characters',
    'any.required': 'Promo code is required',
  }),
  estimatedFare: Joi.number().min(0).required().messages({
    'number.min': 'Estimated fare cannot be negative',
    'any.required': 'Estimated fare is required',
  }),
});

// Common ride ID validation
export const rideIdValidation = Joi.object({
  rideId: Joi.string()
    .pattern(/^RIDE_[A-Z0-9_]+$/)
    .required()
    .messages({
      'string.pattern.base': 'Invalid ride ID format',
      'any.required': 'Ride ID is required',
    }),
});
