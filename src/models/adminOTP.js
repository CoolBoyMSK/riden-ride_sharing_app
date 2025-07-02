import mongoose from 'mongoose';

const adminOtpSchema = new mongoose.Schema(
  {
    target: {
      type: String,
      required: true,
      unique: true,
    },
    otp: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: ['reset_password'],
      required: true,
    },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 30 * 60 * 1000),
      index: { expires: 0 }, // TTL index
    },
  },
  { timestamps: true },
);

export default mongoose.model('AdminOtp', adminOtpSchema);
