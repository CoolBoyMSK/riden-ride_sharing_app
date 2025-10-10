import mongoose from 'mongoose';

const userDeviceSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    deviceId: {
      type: String,
      required: true,
    },
    deviceType: {
      type: String,
      enum: ['android', 'ios'],
      required: true,
    },
    deviceModel: {
      type: String,
    },
    deviceVendor: {
      type: String,
    },
    os: {
      type: String,
    },
    ipAddress: {
      type: String,
    },
    location: {
      country: String,
      city: String,
      region: String,
      timezone: String,
    },
    loginMethod: {
      type: String,
      enum: ['email', 'phone', 'passkey', 'oauth'],
    },
    sessionToken: {
      type: String,
    },
    lastLoginAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
);

export default mongoose.model('UserDevice', userDeviceSchema);
