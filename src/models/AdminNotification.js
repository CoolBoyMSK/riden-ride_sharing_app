import mongoose from 'mongoose';
import { ADMIN_MODULES } from '../enums/adminEnums.js';

const recipientSchema = new mongoose.Schema(
  {
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
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
      enum: ADMIN_MODULES,
      index: true,
    },
    actionLink: {
      type: String,
    },
    recipients: [recipientSchema],
  },
  { timestamps: true },
);

export default mongoose.model('AdminNotification', notificationSchema);
