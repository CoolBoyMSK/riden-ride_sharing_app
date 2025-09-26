import mongoose from 'mongoose';

const payoutSchema = new mongoose.Schema(
  {
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Driver',
      required: true,
    },
    balance: {
      type: Number,
      min: 0,
      default: 0,
    },
    rides: {
      type: Number,
      min: 0,
      default: 0,
    },
  },
  { timestamps: true },
);

export default mongoose.model('Payout', payoutSchema);
