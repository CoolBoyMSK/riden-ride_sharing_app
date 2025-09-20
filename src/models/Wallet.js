import mongoose from 'mongoose';

const walletSchema = new mongoose.Schema(
  {
    passengerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Passenger',
      required: true,
      unique: true,
    },
    balance: {
      type: Number,
      default: 0,
      min: [0, 'Balance cannot be negative'],
      validate: {
        validator: (value) => value >= 0,
        message: 'Balance cannot be less than zero',
      },
    },
  },
  { timestamps: true },
);

walletSchema.pre('save', function (next) {
  if (this.balance < 0) {
    return next(new Error('Balance cannot be negative'));
  }
  next();
});

export default mongoose.model('Wallet', walletSchema);
