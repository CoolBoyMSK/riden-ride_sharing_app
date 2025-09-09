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
      // required: true,
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

    // Payment
    paymentMethod: {
      type: String,
      enum: ['CARD', 'WALLET', 'CASH'],
      required: true,
    },
    paymentStatus: {
      type: String,
      enum: PAYMENT_STATUS,
      default: 'PENDING',
    },
    paymentTransactionId: {
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

    // Timestamps
    requestedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    driverAssignedAt: {
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

    // Rating & Feedback
    passengerRating: {
      rating: {
        type: Number,
        min: 1,
        max: 5,
      },
      feedback: {
        type: String,
        trim: true,
        maxlength: 500,
      },
    },
    driverRating: {
      rating: {
        type: Number,
        min: 1,
        max: 5,
      },
      feedback: {
        type: String,
        trim: true,
        maxlength: 500,
      },
    },

    // Metadata
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
rideSchema.index({ 'pickupLocation.coordinates': '2dsphere' });
rideSchema.index({ 'dropoffLocation.coordinates': '2dsphere' });

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
