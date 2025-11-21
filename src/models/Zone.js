import mongoose from 'mongoose';
import { ZONE_TYPES } from '../enums/zoneEnums.js';

const zoneSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
      minlength: [3, 'Zone name must be at least 3 characters long'],
    },
    type: {
      type: String,
      enum: {
        values: ZONE_TYPES,
        message: `Invalid zone type. Must be one of: ${ZONE_TYPES.join(', ')}`,
      },
      required: [true, 'Zone type is required'],
      index: true,
    },
    boundaries: {
      type: {
        type: String,
        enum: {
          values: ['Polygon'],
          message: 'Boundary type must be Polygon',
        },
        required: [true, 'Boundary type is required'],
      },
      coordinates: {
        type: [[[Number]]], // Array of arrays of [lng, lat] pairs
        required: true,
      },
    },
    minSearchRadius: {
      type: Number, // Kilometers
      default: 5,
      min: [1, 'Minimum search radius must be at least 1km'],
      max: [50, 'Minimum search radius cannot exceed 50km'],
      validate: {
        validator: function (value) {
          return value <= this.maxSearchRadius;
        },
        message:
          'Minimum search radius cannot be greater than maximum search radius',
      },
    },
    maxSearchRadius: {
      type: Number, // Kilometers
      default: 10,
      min: [1, 'Maximum search radius must be at least 1km'],
      max: [100, 'Maximum search radius cannot exceed 100km'],
      validate: {
        validator: function (value) {
          return value >= this.minSearchRadius;
        },
        message:
          'Maximum search radius cannot be less than minimum search radius',
      },
    },
    minRadiusSearchTime: {
      type: Number, // Minutes
      default: 2,
      min: [1, 'Minimum radius search time must be at least 1 minute'],
      max: [30, 'Minimum radius search time cannot exceed 30 minutes'],
      validate: {
        validator: function (value) {
          return value <= this.maxRadiusSearchTime + 30; // Allow some flexibility
        },
        message:
          'Minimum radius search time is too long compared to maximum time',
      },
    },
    maxRadiusSearchTime: {
      type: Number, // Minutes
      default: 1,
      min: [1, 'Maximum radius search time must be at least 1 minute'],
      max: [60, 'Maximum radius search time cannot exceed 60 minutes'],
      validate: {
        validator: function (value) {
          return value >= this.minRadiusSearchTime || value === 1;
        },
        message:
          'Maximum radius search time cannot be less than minimum radius search time',
      },
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
    },
    metadata: {
      type: Object,
    },
  },
  { timestamps: true },
);

zoneSchema.index({ boundaries: '2dsphere' });

export default mongoose.model('Zone', zoneSchema);
