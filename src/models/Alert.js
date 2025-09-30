import mongoose from 'mongoose';

const alertBlockSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      trim: true,
    },
    body: {
      type: String,
      trim: true,
    },
    data: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  { _id: false },
);

const alertSchema = new mongoose.Schema(
  {
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      required: true,
      index: true,
    },
    audience: {
      type: String,
      enum: ['all', 'drivers', 'passengers', 'custom'],
      default: 'all',
    },
    recipients: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        index: true,
      },
    ], // for custom
    blocks: [alertBlockSchema], // supports multiple messages or localized payloads
    status: {
      type: String,
      enum: ['PENDING', 'IN_PROGRESS', 'SENT', 'FAILED'],
      default: 'PENDING',
      index: true,
    },
    stats: {
      totalTargets: {
        type: Number,
        default: 0,
      },
      sent: {
        type: Number,
        default: 0,
      },
      failed: {
        type: Number,
        default: 0,
      },
      invalidTokens: {
        type: Number,
        default: 0,
      },
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  { timestamps: true },
);

export default mongoose.model('Alert', alertSchema);
