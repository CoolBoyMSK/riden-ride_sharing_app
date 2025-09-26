import mongoose from 'mongoose';

const instantPayoutRequestSchema = new mongoose.Schema(
  {
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Driver',
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 10,
    },
    rides: {
      type: Number,
      required: true,
      min: 1,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
  },
  { timestamps: true },
);

export default mongoose.model(
  'InstantPayoutRequest',
  instantPayoutRequestSchema,
);
