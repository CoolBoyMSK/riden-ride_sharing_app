import mongoose from 'mongoose';
import { CAR_TYPES } from '../enums/carType.js';

const adminCommissionSchema = new mongoose.Schema(
  {
    date: {
      type: Date,
    },
    rideId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ride',
      required: true,
      unique: true,
    },
    carType: {
      type: String,
      enum: CAR_TYPES,
      required: true,
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    discount: {
      type: Number,
      default: 0,
      required: true,
    },
    commission: {
      type: Number,
      required: true,
      min: 5,
    },
    commissionAmount: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { timestamps: true },
);

export default mongoose.model('AdminCommission', adminCommissionSchema);
