import mongoose from 'mongoose';
import { ALLOWED_SETTINGS } from '../enums/userSettings.js';

const recipientSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    readAt: {
      type: Date,
      default: null,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { _id: false },
);

const notificationSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      min: 3,
      max: 500,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      min: 3,
      max: 500,
    },
    metadata: {
      type: Object,
    },
    type: {
      type: String,
      required: true,
      enum: ['ALERT'],
      default: 'ALERT',
      index: true,
    },
    module: {
      type: String,
      enum: ALLOWED_SETTINGS,
      required: true,
      index: true,
    },
    actionLink: {
      type: String,
    },
    recipient: recipientSchema,
  },
  { timestamps: true },
);

export default mongoose.model('Notification', notificationSchema);
