import mongoose from 'mongoose';

const userOtpSchema = new mongoose.Schema(
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
      enum: ['email', 'phone'],
      required: true,
    },
    replaceWith: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
    },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 2 * 60 * 1000),
      index: { expires: 0 },
    },
  },
  {
    timestamps: true,
  },
);

const UserOtpModel = mongoose.model('UserOtp', userOtpSchema);

export default UserOtpModel;
