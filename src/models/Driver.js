import mongoose from 'mongoose';

const suspensionSchema = new mongoose.Schema(
  {
    reason: {
      type: String,
      required: true,
      trim: true,
    },
    start: {
      type: Date,
      required: true,
      default: () => new Date(),
    },
    end: {
      type: Date,
      required: true,
    },
  },
  { _id: false },
);

const driverSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      unique: true,
      required: true,
    },
    licenseDocs: {
      frontUrl: { type: String, required: true, trim: true },
      backUrl: { type: String, required: true, trim: true },
    },
    vehicle: {
      make: { type: String, trim: true },
      model: { type: String, trim: true },
      plateNumber: { type: String, trim: true },
      color: { type: String, trim: true },
    },
    backgroundCheckStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    payoutDetails: {
      bankAccount: { type: String, trim: true },
      ifscCode: { type: String, trim: true },
    },
    isBlocked: {
      type: Boolean,
      default: false,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    suspensions: {
      type: [suspensionSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  },
);

export default mongoose.model('Driver', driverSchema);
