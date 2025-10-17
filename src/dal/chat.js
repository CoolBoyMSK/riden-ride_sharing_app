import ChatMessage from '../models/ChatMessage.js';
import ChatRoom from '../models/ChatRoom.js';
import Ride from '../models/Ride.js';
import mongoose from 'mongoose';

export const findChatRoomByRideId = async (rideId) => {
  const chatRoom = await ChatRoom.aggregate([
    // Match by rideId
    { $match: { rideId: new mongoose.Types.ObjectId(rideId) } },

    // Lookup messages with sorting
    {
      $lookup: {
        from: 'chatmessages',
        let: { messageIds: '$messages.messageId' },
        pipeline: [
          {
            $match: {
              $expr: { $in: ['$_id', '$$messageIds'] },
            },
          },
          { $sort: { createdAt: -1 } }, // Sort messages here
          {
            $lookup: {
              from: 'users',
              localField: 'senderId',
              foreignField: '_id',
              as: 'senderInfo',
            },
          },
          {
            $addFields: {
              sender: {
                $arrayElemAt: ['$senderInfo', 0],
              },
            },
          },
          {
            $project: {
              senderInfo: 0,
              'sender.password': 0,
              'sender.__v': 0,
              // Include other fields you want to exclude
            },
          },
        ],
        as: 'messages',
      },
    },

    // Clean up sender object in messages
    {
      $addFields: {
        messages: {
          $map: {
            input: '$messages',
            as: 'msg',
            in: {
              _id: '$$msg._id',
              text: '$$msg.text',
              attachments: '$$msg.attachments',
              readAt: '$$msg.readAt',
              replyTo: '$$msg.replyTo',
              isDeleted: '$$msg.isDeleted',
              editedAt: '$$msg.editedAt',
              createdAt: '$$msg.createdAt',
              updatedAt: '$$msg.updatedAt',
              sender: {
                _id: '$$msg.sender._id',
                name: '$$msg.sender.name',
                profileImg: '$$msg.sender.profileImg',
              },
            },
          },
        },
      },
    },

    // Clean fields
    {
      $project: {
        __v: 0,
        createdAt: 0,
        updatedAt: 0,
        type: 0,
      },
    },
  ]);

  return chatRoom[0] || null;
};

export const updateChatById = async (chatId, payload) => {
  const chat = await ChatRoom.findByIdAndUpdate(chatId, payload, { new: true });
  if (!chat) return false;

  const chatRoom = await ChatRoom.aggregate([
    // Match by rideId
    { $match: { rideId: new mongoose.Types.ObjectId(chat.rideId) } },

    // Lookup messages.messageId -> ChatMessage
    {
      $lookup: {
        from: 'chatmessages',
        localField: 'messages.messageId',
        foreignField: '_id',
        as: 'messagesData',
      },
    },

    // Lookup sender details
    {
      $lookup: {
        from: 'users',
        localField: 'messagesData.senderId',
        foreignField: '_id',
        as: 'senders',
      },
    },

    // Sort messagesData by createdAt (latest first)
    {
      $addFields: {
        messagesData: {
          $sortArray: { input: '$messagesData', sortBy: { createdAt: -1 } },
        },
      },
    },

    // Take only the first (latest) message
    {
      $addFields: {
        latestMessage: { $arrayElemAt: ['$messagesData', 0] },
      },
    },

    // Merge sender info into latestMessage
    {
      $addFields: {
        message: {
          _id: '$latestMessage._id',
          text: '$latestMessage.text',
          attachments: '$latestMessage.attachments',
          readAt: '$latestMessage.readAt',
          replyTo: '$latestMessage.replyTo',
          isDeleted: '$latestMessage.isDeleted',
          editedAt: '$latestMessage.editedAt',
          createdAt: '$latestMessage.createdAt',
          updatedAt: '$latestMessage.updatedAt',
          sender: {
            $let: {
              vars: {
                sender: {
                  $arrayElemAt: [
                    {
                      $filter: {
                        input: '$senders',
                        as: 's',
                        cond: { $eq: ['$$s._id', '$latestMessage.senderId'] },
                      },
                    },
                    0,
                  ],
                },
              },
              in: {
                _id: '$$sender._id',
                name: '$$sender.name',
                profileImg: '$$sender.profileImg',
              },
            },
          },
        },
      },
    },

    // Final projection
    {
      $project: {
        _id: 1,
        rideId: 1,
        message: 1,
      },
    },
  ]);

  return chatRoom[0] || null;
};

export const createMessage = async ({
  rideId,
  senderId,
  chatRoomId,
  text,
  messageType = 'text',
  attachments = [],
  replyTo = null,
}) => {
  try {
    const message = new ChatMessage({
      rideId,
      senderId,
      chatRoomId,
      text,
      messageType,
      attachments,
      replyTo,
    });

    const savedMessage = await message.save();

    // Populate sender information
    await savedMessage.populate('senderId', 'name profileImg');

    // Notification Logic Start
    let recipientUserId = null;
    let role = null;

    const ride = await Ride.findById(rideId)
      .populate('passengerId driverId', 'userId')
      .select('passengerId driverId')
      .lean();

    if (!ride || !ride.passengerId || !ride.driverId) {
      throw new Error('Ride, driver, or passenger not found.');
    }

    const driverUserId = ride.driverId?.userId;
    const passengerUserId = ride.passengerId?.userId;

    if (!driverUserId || !passengerUserId) {
      throw new Error('Driver or passenger userId missing.');
    }

    // Determine recipient (the opposite of the sender)
    if (String(senderId) === String(driverUserId)) {
      recipientUserId = passengerUserId;
      role = 'Passenger';
    } else if (String(senderId) === String(passengerUserId)) {
      recipientUserId = driverUserId;
      role = 'Driver';
    } else {
      throw new Error('Sender does not belong to this ride.');
    }

    return savedMessage.toObject();
  } catch (error) {
    console.error('Error creating message:', error);
    throw new Error('Failed to create message');
  }
};

export const findMessageById = async (messageId) =>
  ChatMessage.findById(messageId).populate('senderId').lean();

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

export const markAllRideMessagesAsRead = async (rideId, userId) => {
  const result = await ChatMessage.updateMany(
    {
      rideId,
      isDeleted: false,
      senderId: { $ne: userId },
      'readBy.userId': { $ne: userId },
    },
    {
      $addToSet: { readBy: { userId, readAt: new Date() } },
    },
  );

  return result.modifiedCount;
};

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
