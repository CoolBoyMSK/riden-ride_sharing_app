import mongoose from 'mongoose';

const PayoutRequestSchema = new mongoose.Schema({
  driverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Driver',
    required: true,
  },
  amount: {
    type: Number,
    required: true,
    min: [9.99, 'Minimum payout must be atleast $10'],
  },
  status: {
    type: String,
    enum: ['PENDING', 'APPROVED', 'REJECTED', 'SUCCESS'],
    default: 'PENDING',
  },
  rides: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ride',
    },
  ],
  requestedAt: {
    type: Date,
    default: Date.now,
  },
  approvedAt: {
    type: Date,
  },
  paidAt: {
    type: Date,
  },
});

export default mongoose.model('InstantPayoutRequest', PayoutRequestSchema);
