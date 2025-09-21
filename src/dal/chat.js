import ChatMessage from '../models/ChatMessage.js';
import ChatRoom from '../models/ChatRoom.js';

export const findChatRoomByRideId = async (rideId) =>
  ChatRoom.findOne({ rideId }).populate('messages.messageId').lean();

export const updateChatById = async (chatId, payload) =>
  ChatRoom.findByIdAndUpdate(chatId, payload, { new: true });

// Create a new chat message
export const createMessage = async ({
  rideId,
  senderId,
  chatRoomId,
  text,
  messageType = 'text',
  attachments = [],
  messageId = null,
}) => {
  try {
    const message = new ChatMessage({
      rideId,
      senderId,
      chatRoomId,
      text,
      messageType,
      attachments,
      replyTo: messageId,
    });

    const savedMessage = await message.save();

    // Populate sender information
    await savedMessage.populate('senderId', 'name profileImg');

    return savedMessage.toObject();
  } catch (error) {
    console.error('Error creating message:', error);
    throw new Error('Failed to create message');
  }
};

export const findMessageById = async (messageId) =>
  ChatMessage.findById(messageId).populate('senderId').lean();

// Get messages for a specific ride
export const getMessagesByRide = async (rideId, options = {}) => {
  try {
    const { before = null, limit = 50, includeDeleted = false } = options;

    const query = { rideId };

    if (!includeDeleted) {
      query.isDeleted = false;
    }

    if (before) {
      query.createdAt = { $lt: new Date(before) };
    }

    const messages = await ChatMessage.find(query)
      .populate('senderId', 'name profileImg')
      .populate('replyTo', 'text senderId createdAt')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .lean();

    return messages.reverse(); // Return in chronological order
  } catch (error) {
    console.error('Error fetching messages:', error);
    throw new Error('Failed to fetch messages');
  }
};

// Mark message as delivered
export const markMessageDelivered = async (messageId, userId) => {
  try {
    const result = await ChatMessage.updateOne(
      {
        _id: messageId,
        senderId: { $ne: userId }, // Don't mark own messages as delivered
        deliveredAt: null,
      },
      {
        $set: { deliveredAt: new Date() },
      },
    );

    return result;
  } catch (error) {
    console.error('Error marking message as delivered:', error);
    throw new Error('Failed to mark message as delivered');
  }
};

// Mark message as read
export const markMessageRead = async (messageId, userId) => {
  try {
    const message = await ChatMessage.findById(messageId);

    if (!message) {
      throw new Error('Message not found');
    }

    // Don't mark own messages as read
    if (message.senderId.toString() === userId.toString()) {
      return { acknowledged: false, reason: 'Cannot mark own message as read' };
    }

    // Check if already marked as read by this user
    const alreadyRead = message.readBy.some(
      (r) => r.userId.toString() === userId.toString(),
    );

    if (!alreadyRead) {
      message.readBy.push({ userId, readAt: new Date() });

      // Set main readAt if not set
      if (!message.readAt) {
        message.readAt = new Date();
      }

      await message.save();
    }

    return { acknowledged: true };
  } catch (error) {
    console.error('Error marking message as read:', error);
    throw new Error('Failed to mark message as read');
  }
};

// Mark all messages in a ride as delivered for a user
export const markAllMessagesDelivered = async (rideId, userId) => {
  try {
    const result = await ChatMessage.updateMany(
      {
        rideId,
        senderId: { $ne: userId },
        deliveredAt: null,
      },
      {
        $set: { deliveredAt: new Date() },
      },
    );

    return result;
  } catch (error) {
    console.error('Error marking all messages as delivered:', error);
    throw new Error('Failed to mark messages as delivered');
  }
};

// Mark all messages in a ride as read for a user
export const markAllRideMessagesAsRead = async (rideId, userId) => {
  const result = await ChatMessage.updateMany(
    {
      rideId,
      isDeleted: false,
      'readBy.userId': { $ne: userId },
    },
    {
      $addToSet: { readBy: { userId, readAt: new Date() } },
      $set: { readAt: new Date() },
    },
  );

  return result.modifiedCount; // number of updated messages
};

// Get unread message count for a user in a ride
export const getUnreadMessageCount = async (rideId, userId) => {
  try {
    const count = await ChatMessage.countDocuments({
      rideId,
      senderId: { $ne: userId },
      'readBy.userId': { $ne: userId },
      isDeleted: false,
    });

    return count;
  } catch (error) {
    console.error('Error getting unread message count:', error);
    throw new Error('Failed to get unread message count');
  }
};

// Soft delete a message
export const deleteMessage = async (messageId, userId) => {
  try {
    const message = await ChatMessage.findById(messageId);

    if (!message) {
      throw new Error('Message not found');
    }

    // Only allow sender to delete their own message
    if (message.senderId.toString() !== userId.toString()) {
      throw new Error('Unauthorized to delete this message');
    }

    message.isDeleted = true;
    await message.save();

    return { acknowledged: true };
  } catch (error) {
    console.error('Error deleting message:', error);
    throw new Error('Failed to delete message');
  }
};

// Edit a message
export const editMessage = async (messageId, userId, newText) => {
  try {
    const message = await ChatMessage.findById(messageId);

    if (!message) {
      throw new Error('Message not found');
    }

    // Only allow sender to edit their own message
    if (message.senderId.toString() !== userId.toString()) {
      throw new Error('Unauthorized to edit this message');
    }

    // Don't allow editing deleted messages
    if (message.isDeleted) {
      throw new Error('Cannot edit deleted message');
    }

    message.text = newText.trim();
    message.editedAt = new Date();

    await message.save();
    await message.populate('senderId', 'name profileImg');

    return message.toObject();
  } catch (error) {
    console.error('Error editing message:', error);
    throw new Error('Failed to edit message');
  }
};

// Get chat statistics for a ride
export const getChatStats = async (rideId) => {
  try {
    const stats = await ChatMessage.aggregate([
      { $match: { rideId, isDeleted: false } },
      {
        $group: {
          _id: null,
          totalMessages: { $sum: 1 },
          participants: { $addToSet: '$senderId' },
          firstMessage: { $min: '$createdAt' },
          lastMessage: { $max: '$createdAt' },
        },
      },
    ]);

    return (
      stats[0] || {
        totalMessages: 0,
        participants: [],
        firstMessage: null,
        lastMessage: null,
      }
    );
  } catch (error) {
    console.error('Error getting chat stats:', error);
    throw new Error('Failed to get chat statistics');
  }
};
