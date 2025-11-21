import mongoose from 'mongoose';
import { COMPLAIN_TYPES } from '../enums/complainEnums.js';

const chatSchema = new mongoose.Schema(
  {
    isSupportReply: {
      type: Boolean,
      default: true,
    },
    text: {
      type: String,
      trim: true,
    },
    attachments: [
      {
        type: String,
      },
    ],
  },
  { _id: false, timestamps: true },
);

const complainSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ride',
      required: true,
    },
    uniqueId: {
      type: String,
      trim: true,
      unique: true,
    },
    category: {
      type: String,
      enum: ['by_driver', 'by_passenger'],
      required: true,
    },
    type: {
      type: String,
      enum: COMPLAIN_TYPES,
      required: true,
    },
    text: {
      type: String,
      trim: true,
      required: true,
    },
    attachments: [
      {
        type: String,
      },
    ],
    status: {
      type: String,
      enum: ['resolved', 'pending'],
      default: 'pending',
    },
    chat: [
      {
        type: chatSchema,
      },
    ],
  },
  { timestamps: true },
);

export default mongoose.model('ComplainTicket', complainSchema);
