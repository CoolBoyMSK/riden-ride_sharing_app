import mongoose from 'mongoose';
import { CAR_TYPES } from '../enums/vehicleEnums.js';
import { RIDE_STATUS, RIDE_BOOKED_FOR } from '../enums/rideEnums.js';
import { PAYMENT_STATUS, PAYMENT_METHODS } from '../enums/paymentEnums.js';

const locationSchema = new mongoose.Schema(
  {
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: true,
      index: '2dsphere',
    },
    address: {
      type: String,
      required: true,
      trim: true,
    },
    placeName: {
      type: String,
      trim: true,
    },
  },
  { _id: false },
);

const fareBreakdownSchema = new mongoose.Schema(
  {
    rideSetupFee: {
      type: Number,
      required: true,
      min: 0,
    },
    baseFare: {
      type: Number,
      required: true,
      min: 0,
    },
    distanceFare: {
      type: Number,
      required: true,
      min: 0,
    },
    timeFare: {
      type: Number,
      default: 0,
      min: 0,
    },
    nightCharge: {
      type: Number,
      default: 0,
      min: 0,
    },
    waitingCharge: {
      type: Number,
      default: 0,
      min: 0,
    },
    discount: {
      type: Number,
      default: 0,
      min: 0,
    },
    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },
    promoDiscount: {
      type: Number,
      default: 0,
      min: 0,
    },
    surgeMultiplier: {
      type: Number,
      default: 1,
      min: 1,
    },
    surgeAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    finalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false },
);

const rideSchema = new mongoose.Schema(
  {
    rideId: {
      type: String,
      unique: true,
      index: true,
      sparse: true,
    },

    // User References
    passengerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Passenger',
      required: true,
      index: true,
    },
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Driver',
      index: true,
    },

    // Location Data
    pickupLocation: {
      type: locationSchema,
      required: true,
    },
    dropoffLocation: {
      type: locationSchema,
      required: true,
    },

    // Ride Details
    carType: {
      type: String,
      enum: CAR_TYPES,
      required: true,
    },
    bookedFor: {
      type: String,
      enum: RIDE_BOOKED_FOR,
      required: true,
      default: 'ME',
    },
    bookedForName: {
      type: String,
      trim: true,
      required: function () {
        if (this.bookedFor) {
          return this.bookedFor === 'SOMEONE';
        }
        return false;
      },
    },
    bookedForPhoneNumber: {
      type: String,
      trim: true,
      required: function () {
        if (this.bookedFor) {
          return this.bookedFor === 'SOMEONE';
        }
        return false;
      },
    },
    status: {
      type: String,
      enum: RIDE_STATUS,
      default: 'REQUESTED',
      index: true,
    },
    scheduledTime: {
      type: Date,
      validate: {
        validator: (value) => {
          if (!value) return true;

          const now = new Date();
          const thirtyMinutesFromNow = new Date(now.getTime() + 30 * 60 * 1000);
          const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

          // Must be in future and at least 30 minutes from now
          if (value < thirtyMinutesFromNow) return false;

          // Must not be more than 3 days in future
          if (value > threeDaysFromNow) return false;

          return true;
        },
        message:
          'Scheduled time must be at least 30 minutes from now and within the next 3 days',
      },
    },

    // Promo Code Support
    promoCode: {
      code: {
        type: String,
        trim: true,
        uppercase: true,
      },
      discount: {
        type: Number,
        min: 0,
        max: 100,
      },
      isApplied: {
        type: Boolean,
        default: false,
      },
    },

    // Pricing
    estimatedFare: {
      type: Number,
      required: true,
      min: 0,
    },
    actualFare: {
      type: Number,
      min: 0,
    },
    fareBreakdown: fareBreakdownSchema,

    surgeMultiplier: {
      type: Number,
      min: 0,
    },
    isSurgeApplied: {
      type: Boolean,
      default: false,
    },
    surgeLevel: {
      type: Number,
      default: 0,
      min: 0,
    },
    surgeData: {
      type: Object,
    },
    fareUpdates: {
      previousFare: {
        type: Number,
        min: 0,
      },
      newFare: {
        type: Number,
        min: 0,
      },
      surgeMultiplier: {
        type: Number,
        min: 0,
      },
      surgeLevel: {
        type: Number,
        min: 0,
      },
      updatedAt: {
        type: Date,
      },
      reason: {
        type: String,
      },
    },

    tipBreakdown: {
      amount: {
        type: Number,
        default: 0,
        min: 0,
      },
      percent: {
        type: Number,
        default: 0,
        min: 0,
      },
      isApplied: {
        type: Boolean,
      },
    },

    // Payment
    paymentMethod: {
      type: String,
      enum: PAYMENT_METHODS,
      required: true,
    },
    paymentStatus: {
      type: String,
      enum: PAYMENT_STATUS,
      default: 'PENDING',
      index: true,
    },
    paymentTransactionId: {
      type: String,
      trim: true,
    },
    paymentMethodId: {
      type: String,
    },
    paymentIntentId: {
      type: String,
    },
    cardType: {
      type: String,
      required: function () {
        return this.paymentMethod === 'CARD';
      },
    },

    // Distance & Time
    estimatedDistance: {
      type: Number, // in kilometers
      required: true,
      min: 0,
    },
    actualDistance: {
      type: Number, // in kilometers
      min: 0,
    },
    estimatedDuration: {
      type: Number, // in minutes
      required: true,
      min: 0,
    },
    actualDuration: {
      type: Number, // in minutes
      min: 0,
    },
    actualWaitingTime: {
      type: Number, // in minutes
      min: 0,
    },

    // Timestamps
    requestedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    scheduledAt: {
      type: Date,
      default: function () {
        return this.isScheduledRide ? new Date() : undefined;
      },
      index: true,
    },
    driverAssignedAt: {
      type: Date,
    },
    driverArrivingAt: {
      type: Date,
    },
    driverArrivedAt: {
      type: Date,
    },
    passengerReadyAt: {
      type: Date,
    },
    rideStartedAt: {
      type: Date,
    },
    rideCompletedAt: {
      type: Date,
    },
    driverPaidAt: {
      type: Date,
    },
    cancelledAt: {
      type: Date,
    },

    // Additional Information
    specialRequests: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    cancelledBy: {
      type: String,
      enum: ['passenger', 'driver', 'system'],
    },
    cancellationReason: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    earlyCompleteReason: {
      type: String,
      trim: true,
      min: 3,
      maxlength: 500,
    },

    // Rating & Feedback
    isRatingAllow: {
      type: Boolean,
      default: true,
    },
    passengerRating: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Feedback',
    },
    driverRating: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Feedback',
    },

    chatRoomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ChatRoom',
      unique: true,
    },

    // Metadata
    passengersAllowed: {
      type: Number,
      min: 0,
    },
    patientsAllowed: {
      type: Number,
      min: 0,
    },
    isAirport: {
      type: Boolean,
      default: false,
    },
    isReported: {
      type: Boolean,
      default: false,
    },
    isDestinationRide: {
      type: Boolean,
      default: false,
    },
    isScheduledRide: {
      type: Boolean,
      default: false,
    },
    receipt: {
      type: Object,
    },
    fareConfig: {
      type: Object,
      required: true,
    },
    airport: {
      type: Object,
      default: {},
    },
    notifiedDrivers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    driverDistance: {
      type: Number,
      min: 0,
    },
    searchRadius: {
      type: Number,
      min: 0,
    },
    searchStartTime: {
      type: Date,
    },
    searchHistory: [
      {
        radius: {
          type: Number,
          min: 0,
        },
        timestamp: {
          type: Date,
        },
      },
    ],
    zoneName: {
      type: String,
    },
    fareConfigType: {
      type: String,
    },
    expiryTime: {
      type: Date,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  },
);

// Indexes for better performance
rideSchema.index({ passengerId: 1, status: 1 });
rideSchema.index({ driverId: 1, status: 1 });
rideSchema.index({ status: 1, requestedAt: -1 });

export default mongoose.model('Ride', rideSchema);
