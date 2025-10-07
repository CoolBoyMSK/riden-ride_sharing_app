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
    paymentMethodId: {
      type: String,
      trim: true,
    },
    walletId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Wallet',
    },
    rideId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ride',
      index: true,
    },
    type: {
      type: String,
      enum: ['CREDIT', 'DEBIT'], // CREDIT = add funds, DEBIT = deduct funds
      required: true,
    },
    category: {
      type: String,
      enum: [
        'TIP',
        'PAYOUT',
        'TOP-UP',
        'RIDE',
        'INSTANT-PAYOUT',
        'TRANSFER',
        'REFUND',
      ],
      required: true,
      index: true,
    },
    reason: {
      type: String,
      trim: true,
    },
    for: {
      type: String,
      enum: ["admin", "driver", "passenger"],
      required: true,
      index: true
    },
    amount: {
      type: Number,
      required: true,
      min: [0.01, 'Amount must be greater than zero'],
    },
    rides: {
      type: Number,
      default: 0,
    },
    metadata: {
      type: Object,
      default: {},
    },
    status: {
      type: String,
      index: true,
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
