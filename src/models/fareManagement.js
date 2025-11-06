import mongoose from 'mongoose';
import { CAR_TYPES } from '../enums/carType.js';
import { ZONE_TYPES } from '../enums/zoneTypes.js';

const { Schema, model } = mongoose;

const zoneSchema = new Schema(
  {
    name: {
      type: String,
    },
    city: {
      type: String,
      index: true,
    },
    zoneType: {
      type: String,
      enum: ZONE_TYPES,
    },
    boundaries: {
      type: {
        type: String,
        enum: ['Polygon'],
      },
      coordinates: {
        type: [[[Number]]], // Array of arrays of [lng, lat] pairs
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    _id: false,
    timestamps: false,
  },
);

const DailyFareSchema = new Schema(
  {
    carType: {
      type: String,
      enum: CAR_TYPES,
      required: true,
    },
    rideSetupFee: {
      type: Number,
      required: true,
    },
    baseFare: {
      type: Number,
      required: true,
    },
    perMinuteFare: {
      type: Number,
      required: true,
    },
    perKmFare: {
      type: Number,
      required: true,
    },
    waiting: {
      seconds: {
        type: Number,
        required: true,
      },
      charge: {
        type: Number,
        required: true,
      },
    },
    discount: {
      minutes: {
        type: Number,
        required: true,
      },
      distance: {
        type: Number,
        required: true,
      },
      charge: {
        type: Number,
        required: true,
      },
    },
    nightTime: {
      from: {
        type: String,
        required: true,
      },
      to: {
        type: String,
        required: true,
      },
    },
    nightCharge: {
      type: Number,
      required: true,
    },
    surge: [
      {
        level: {
          type: Number,
        },
        ratio: {
          type: String, // drivers : passengers, 1:2
        },
        multiplier: {
          type: Number,
          min: 0,
        },
      },
    ],
  },
  {
    _id: false,
    timestamps: false,
  },
);

const FareManagementSchema = new Schema(
  {
    zone: {
      type: zoneSchema,
      // ✅ Make zone optional for default/fallback fares
    },
    dailyFares: {
      type: [DailyFareSchema],
      required: true,
      validate: {
        validator: function (fares) {
          // Validate that all car types are unique within this array
          const carTypes = fares.map((fare) => fare.carType);
          return carTypes.length === new Set(carTypes).size;
        },
        message: 'Duplicate car types found in dailyFares array',
      },
    },
    isDefault: {
      type: Boolean,
      default: false,
      index: true,
    },
    applicableRegions: {
      type: [String], // e.g., ['New York', 'California'], empty means global
      default: [],
    },
  },
  {
    timestamps: true,
  },
);

// ✅ UPDATED: Make zone name uniqueness conditional (only for zoned fares)
FareManagementSchema.index(
  {
    'zone.name': 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      'zone.isActive': true,
      'zone.name': { $exists: true }, // Only enforce uniqueness when zone name exists
    },
  },
);

// ✅ NEW: Ensure only one default fare configuration per region
FareManagementSchema.index(
  {
    isDefault: 1,
    applicableRegions: 1,
  },
  {
    partialFilterExpression: { isDefault: true },
  },
);

// Geo-spatial index for efficient queries (only for zoned fares)
FareManagementSchema.index(
  {
    'zone.boundaries': '2dsphere',
  },
  {
    partialFilterExpression: { 'zone.boundaries': { $exists: true } },
  },
);

FareManagementSchema.index({ 'zone.city': 1, 'zone.isActive': 1 });
FareManagementSchema.index({ 'dailyFares.carType': 1 });

export default model('FareManagement', FareManagementSchema);
