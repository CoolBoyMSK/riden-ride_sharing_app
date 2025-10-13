import mongoose from 'mongoose';
import PAYMENT_METHODS from '../enums/paymentMethods.js';

const rideTransactionSchema = new mongoose.Schema(
  {
    rideId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ride',
      required: true,
    },
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Driver',
      required: true,
    },
    passengerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Passenger',
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    commission: {
      type: Number,
      required: true,
    },
    discount: {
      type: Number,
      default: 0,
    },
    tip: {
      type: Number,
      default: 0,
    },
    driverEarning: {
      type: Number,
      required: true,
    },
    paymentMethod: {
      type: String,
      enum: PAYMENT_METHODS,
    },
    status: {
      type: String,
      enum: ['COMPLETED', 'REFUNDED', 'DISPUTED'],
    },
    isRefunded: {
      type: Boolean,
      default: false,
    },
    payoutWeek: {
      type: String, // Format: '25-10-2025' or 'week_2025_42'
      required: true,
    },
    metadata: {
      type: Object,
    },
  },
  { timestamps: true },
);

export default mongoose.model('RideTransaction', rideTransactionSchema);
