import mongoose from 'mongoose';

const reportSchema = new mongoose.Schema(
  {
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ride',
      required: true,
    },
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Driver',
    },
    passengerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Passenger',
    },
    uniqueId: {
      type: String,
      unique: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ['resolved', 'pending'],
      default: 'pending',
    },
    type: {
      type: String,
      enum: ['by_driver', 'by_passenger'],
      required: true,
    },
    reason: {
      type: String,
      required: true,
      min: 3,
      max: 500,
    },
  },
  { timestamps: true },
);

export default mongoose.model('Report', reportSchema);
