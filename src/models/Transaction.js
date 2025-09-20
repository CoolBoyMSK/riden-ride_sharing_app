import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema(
  {
    passengerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Passenger',
    },
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Driver',
    },
    walletId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Wallet',
    },
    rideId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ride',
    },
    type: {
      type: String,
      enum: ['CREDIT', 'DEBIT'], // CREDIT = add funds, DEBIT = deduct funds
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: [0.01, 'Amount must be greater than zero'],
    },
    metadata: {
      type: Object,
      default: {},
    },
    status: {
      type: String,
    },
    referenceId: {
      type: String,
      trim: true,
    },
    receiptUrl: {
      type: String,
      trim: true,
      default: '',
    },
  },
  { timestamps: true },
);

transactionSchema.pre('save', function (next) {
  if (this.balanceAfter < 0) {
    return next(new Error('Balance after transaction cannot be negative'));
  }
  next();
});

export default mongoose.model('Transaction', transactionSchema);
