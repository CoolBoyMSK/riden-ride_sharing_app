import mongoose from 'mongoose';

const driverWalletSchema = new mongoose.Schema(
  {
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Driver',
      required: true,
      unique: true,
    },
    availableBalance: {
      type: Number,
      default: 0,
    },
    pendingBalance: {
      type: Number,
      default: 0,
    },
    negativeBalance: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true },
);

export default mongoose.model('DriverWallet', driverWalletSchema);
