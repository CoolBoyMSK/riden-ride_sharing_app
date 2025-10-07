import mongoose from 'mongoose';
import { CALL_TYPES, CALL_STATUS } from '../enums/call.js';

const callLogSchema = new mongoose.Schema(
  {
    callerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    receiverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    rideId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ride',
      required: true,
      index: true,
    },
    channelName: {
      type: String,
      required: true,
      index: true,
    },
    rtcToken: {
      type: String,
    },
    callType: {
      type: String,
      enum: CALL_TYPES,
      default: 'audio',
    },
    status: {
      type: String,
      enum: CALL_STATUS,
      default: 'ringing',
    },
    startedAt: {
      type: Date,
    },
    endedAt: {
      type: Date,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  { timestamps: true },
);

export default mongoose.model('CallLog', callLogSchema);
