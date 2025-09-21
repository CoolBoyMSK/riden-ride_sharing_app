import mongoose from 'mongoose';
import { CHAT_ROOM_TYPES } from '../enums/chatEnums.js';

const messagesSchema = new mongoose.Schema(
  {
    messageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ChatMessage',
    },
  },
  { _id: false },
);

const chatRoomSchema = new mongoose.Schema(
  {
    passengerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Passenger',
    },
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Driver',
    },
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      required: function () {
        return this.paymentMethod === 'ADMIN';
      },
    },
    rideId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ride',
      required: function () {
        return this.paymentMethod === 'RIDE';
      },
    },
    type: {
      type: String,
      enum: CHAT_ROOM_TYPES,
      required: true,
    },
    messages: [messagesSchema],
  },
  { timestamps: true },
);

export default mongoose.model('ChatRoom', chatRoomSchema);
