import mongoose from 'mongoose';

const PayoutSchema = new mongoose.Schema({
  driverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Driver',
    required: true,
  },
  amount: {
    type: Number,
    required: true,
  },
  rides: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ride',
    },
  ],
  payoutType: {
    type: String,
    enum: ['SCHEDULED', 'INSTANT'],
    required: true,
  },
  payoutRequestId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'InstantPayoutRequest',
  },
  status: {
    type: String,
    enum: ['PENDING', 'SUCCESS', 'FAILED'],
    default: 'PENDING',
  },
  payoutDate: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model('Payout', PayoutSchema);
