import mongoose from 'mongoose';
import { DAYS_OF_WEEK } from '../enums/weekDays.js';
import { CAR_TYPES } from '../enums/carType.js';

const { Schema, model } = mongoose;

const DailyFareSchema = new Schema(
  {
    day: {
      type: String,
      enum: DAYS_OF_WEEK,
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
    peakCharge: {
      type: Number,
      required: true,
    },
    surge: [
      {
        level: {
          type: Number,
        },
        ratio: {
          type: String,
        },
        multiplier: {
          type: Number,
          min: 0,
        },
      },
    ],
    airportCharge: {
      type: Number,
      required: true,
    },
  },
  {
    _id: false,
    timestamps: false,
  },
);

const FareManagementSchema = new Schema(
  {
    carType: {
      type: String,
      enum: CAR_TYPES,
      required: true,
      unique: true,
    },
    dailyFares: {
      type: [DailyFareSchema],
      validate: {
        validator: (arr) => arr.length === 7,
        message:
          'You must provide exactly 7 daily fare entries (one for each day of the week).',
      },
    },
  },
  {
    timestamps: true,
  },
);

export default model('FareManagement', FareManagementSchema);
