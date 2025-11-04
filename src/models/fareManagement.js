// import mongoose from 'mongoose';
// import { DAYS_OF_WEEK } from '../enums/weekDays.js';
// import { CAR_TYPES } from '../enums/carType.js';

// const { Schema, model } = mongoose;

// const DailyFareSchema = new Schema(
//   {
//     day: {
//       type: String,
//       enum: DAYS_OF_WEEK,
//       required: true,
//     },
//     rideSetupFee: {
//       type: Number,
//       required: true,
//     },
//     baseFare: {
//       type: Number,
//       required: true,
//     },
//     perMinuteFare: {
//       type: Number,
//       required: true,
//     },
//     perKmFare: {
//       type: Number,
//       required: true,
//     },
//     waiting: {
//       seconds: {
//         type: Number,
//         required: true,
//       },
//       charge: {
//         type: Number,
//         required: true,
//       },
//     },
//     discount: {
//       minutes: {
//         type: Number,
//         required: true,
//       },
//       distance: {
//         type: Number,
//         required: true,
//       },
//       charge: {
//         type: Number,
//         required: true,
//       },
//     },
//     nightTime: {
//       from: {
//         type: String,
//         required: true,
//       },
//       to: {
//         type: String,
//         required: true,
//       },
//     },
//     nightCharge: {
//       type: Number,
//       required: true,
//     },
//     peakCharge: {
//       type: Number,
//       required: true,
//     },
//     surge: [
//       {
//         level: {
//           type: Number,
//         },
//         ratio: {
//           type: String,
//         },
//         multiplier: {
//           type: Number,
//           min: 0,
//         },
//       },
//     ],
//     airportCharge: {
//       type: Number,
//       required: true,
//     },
//   },
//   {
//     _id: false,
//     timestamps: false,
//   },
// );

// const FareManagementSchema = new Schema(
//   {
//     carType: {
//       type: String,
//       enum: CAR_TYPES,
//       required: true,
//       unique: true,
//     },
//     dailyFares: {
//       type: [DailyFareSchema],
//       validate: {
//         validator: (arr) => arr.length === 7,
//         message:
//           'You must provide exactly 7 daily fare entries (one for each day of the week).',
//       },
//     },
//   },
//   {
//     timestamps: true,
//   },
// );

// export default model('FareManagement', FareManagementSchema);

import mongoose from 'mongoose';
import { CAR_TYPES } from '../enums/carType.js';
import { ZONE_TYPES } from '../enums/zoneTypes.js';

const { Schema, model } = mongoose;

const zoneSchema = new Schema(
  {
    name: {
      type: String,
      index: true,
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
  },
  {
    timestamps: true,
  },
);

// Index for zone name uniqueness
FareManagementSchema.index(
  {
    'zone.name': 1,
  },
  {
    unique: true,
    partialFilterExpression: { 'zone.isActive': true },
  },
);

// Geo-spatial index for efficient queries
FareManagementSchema.index({ 'zone.boundaries': '2dsphere' });
FareManagementSchema.index({ 'zone.city': 1, 'zone.isActive': 1 });

// Index for efficient car type queries
FareManagementSchema.index({ 'dailyFares.carType': 1 });

export default model('FareManagement', FareManagementSchema);
