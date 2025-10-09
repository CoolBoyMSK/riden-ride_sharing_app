import mongoose from 'mongoose';

const driverPayoutSchema = new mongoose.Schema(
  {
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Driver',
      required: true,
    },
    weekStart: {
      type: String, // Format: 'dd-mm-yyyy'
      required: true,
    },
    weekEnd: {
      type: String, // Format: 'dd-mm-yyyy'
      required: true,
    },
    totalEarnings: {
      type: Number,
      default: 0,
    },
    totalPaid: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['pending', 'paid', 'partial'],
      default: 'pending',
    },
    payoutMethod: {
      type: String,
      enum: ['automatic', 'instant'],
      required: true,
    },
    payoutDate: {
      type: Date,
    },
    stripeTransferId: {
      type: String,
    },
  },
  { timestamps: true },
);

export default mongoose.model('DriverPayout', driverPayoutSchema);
