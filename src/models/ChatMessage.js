import mongoose from 'mongoose';

const chatMessageSchema = new mongoose.Schema(
  {
    rideId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
      ref: 'Ride',
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    chatRoomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ChatRoom',
      required: true,
      index: true,
    },
    text: {
      type: String,
      trim: true,
      required: true,
      maxlength: 1000,
    },
    messageType: {
      type: String,
      enum: ['text', 'system', 'location', 'image'],
      default: 'text',
    },
    attachments: [
      {
        type: {
          type: String,
          enum: ['image', 'document', 'location'],
        },
        url: String,
        filename: String,
        size: Number,
      },
    ],
    deliveredAt: {
      type: Date,
      default: null,
    },
    readAt: {
      type: Date,
      default: null,
    },
    readBy: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        readAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    isDeleted: {
      type: Boolean,
      default: false,
    },
    editedAt: {
      type: Date,
      default: null,
    },
    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ChatMessage',
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

// Indexes for better performance
chatMessageSchema.index({ rideId: 1, createdAt: -1 });
chatMessageSchema.index({ senderId: 1, createdAt: -1 });
chatMessageSchema.index({ rideId: 1, isDeleted: 1, createdAt: -1 });

// TTL index to automatically delete old messages (optional - 90 days)
chatMessageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 }); // 90 days

// Virtual for sender details
chatMessageSchema.virtual('sender', {
  ref: 'User',
  localField: 'senderId',
  foreignField: '_id',
  justOne: true,
});

// Ensure virtual fields are serialized
chatMessageSchema.set('toJSON', { virtuals: true });
chatMessageSchema.set('toObject', { virtuals: true });

// Pre-save middleware
chatMessageSchema.pre('save', function (next) {
  // Auto-set deliveredAt when message is created
  if (this.isNew && !this.deliveredAt) {
    this.deliveredAt = new Date();
  }
  next();
});

// Instance methods
chatMessageSchema.methods.markAsRead = function (userId) {
  if (!this.readBy.some((r) => r.userId.toString() === userId.toString())) {
    this.readBy.push({ userId, readAt: new Date() });
  }
  if (!this.readAt) {
    this.readAt = new Date();
  }
  return this.save();
};

chatMessageSchema.methods.softDelete = function () {
  this.isDeleted = true;
  return this.save();
};

// Static methods
chatMessageSchema.statics.getRecentMessages = function (
  rideId,
  limit = 50,
  before = null,
) {
  const query = { rideId, isDeleted: false };
  if (before) {
    query.createdAt = { $lt: new Date(before) };
  }

  return this.find(query)
    .populate('senderId', 'name profileImg')
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
};

chatMessageSchema.statics.markRideMessagesAsDelivered = function (
  rideId,
  userId,
) {
  return this.updateMany(
    {
      rideId,
      senderId: { $ne: userId },
      deliveredAt: null,
    },
    { $set: { deliveredAt: new Date() } },
  );
};

export default mongoose.model('ChatMessage', chatMessageSchema);
