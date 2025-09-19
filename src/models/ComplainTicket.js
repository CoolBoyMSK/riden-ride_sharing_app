import mongoose from 'mongoose';
import { COMPLAIN_TYPES } from '../enums/complainTypes.js';

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
  },
  { timestamps: true },
);

export default mongoose.model('ComplainTicket', complainSchema);
