import mongoose from 'mongoose';

const biometricSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    biometricEnabled: {
      type: Boolean,
      default: false,
    },
    lastBiometricUsed: {
      type: Date,
      default: null,
    },
    publicKey: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
      required: true,
    },
    deviceId: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

export default mongoose.model('Biometric', biometricSchema);
