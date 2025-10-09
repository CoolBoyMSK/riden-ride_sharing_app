import mongoose from 'mongoose';

const refundTransactionSchema = new mongoose.Schema(
  {
    rideId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ride',
      required: true,
    },
    passengerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Driver',
      required: true,
    },
    refundAmount: {
      type: Number,
      required: true,
    },
    refundReason: {
      type: String,
    },
    driverDeducted: {
      type: Boolean,
      default: false,
    },
    resolvedBy: {
      type: String,
      enum: ['admin', 'auto'],
      default: 'admin',
    },
  },
  { timestamps: true },
);

export default mongoose.model('RefundTransaction', refundTransactionSchema);
