import mongoose from 'mongoose';
import { CAR_TYPES } from '../enums/carType.js';
import { RIDE_STATUS, PAYMENT_STATUS } from '../enums/rideStatus.js';

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
    airportRideFee: {
      type: Number,
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
    peakCharge: {
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
    status: {
      type: String,
      enum: RIDE_STATUS,
      default: 'REQUESTED',
      index: true,
    },
    scheduledTime: {
      type: Date,
      default: Date.now,
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
        default: false,
      },
    },

    // Payment
    paymentMethod: {
      type: String,
      enum: ['CARD', 'WALLET'],
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
    walletId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Wallet',
      required: function () {
        return this.paymentMethod === 'WALLET';
      },
    },
    walletId: {
      type: String,
      trim: true,
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
    driverAssignedAt: {
      type: Date,
    },
    driverArrivingAt: {
      type: Date,
    },
    driverArrivedAt: {
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
    receipt: {
      type: Object,
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

    // Metadata
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
// rideSchema.index({ 'pickupLocation.coordinates': '2dsphere' });
// rideSchema.index({ 'dropoffLocation.coordinates': '2dsphere' });

// Generate ride ID before saving
rideSchema.pre('save', function (next) {
  if (!this.rideId) {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 5);
    this.rideId = `RIDE_${timestamp}_${random}`.toUpperCase();
  }
  next();
});

export default mongoose.model('Ride', rideSchema);
