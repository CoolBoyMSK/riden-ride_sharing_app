import mongoose from 'mongoose';

const payoutSchema = new mongoose.Schema(
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
    type: {
      type: String,
      enum: [],
      required: true,
    },
  },
  { timestamps: true },
);

export default mongoose.model('Payout', payoutSchema);
