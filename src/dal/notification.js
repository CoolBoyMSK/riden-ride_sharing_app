import mongoose from 'mongoose';
import User from '../models/User.js';
import AdminNotification from '../models/AdminNotification.js';
import AdminAccess from '../models/AdminAccess.js';
import Notification from '../models/Notification.js';
import { ALLOWED_SETTINGS } from '../enums/userSettings.js';
import firebaseAdmin from '../config/firebaseAdmin.js';
import { emitToUser } from '../realtime/socket.js';

export const findNotificationSettings = (id) =>
  User.findById(id).select('notifications').lean();

export const updateNotificaition = (id, payload) =>
  User.findByIdAndUpdate(id, payload, { new: true })
    .select('notifications')
    .lean();

export const findAdminNotifications = async (adminId, page = 1, limit = 10) => {
  const access = await AdminAccess.findOne({ admin: adminId })
    .select('modules')
    .lean();

  if (!access || !access.modules?.length) {
    return {
      notifications: [],
      pagination: {
        total: 0,
        page,
        limit,
        totalPages: 0,
        hasNext: false,
        hasPrev: false,
      },
    };
  }

  // Calculate skip value for pagination
  const skip = (page - 1) * limit;

  // Get total count for pagination info
  const totalCount = await AdminNotification.countDocuments({
    module: { $in: access.modules },
    'recipients.adminId': adminId,
    'recipients.isDeleted': false,
  });

  // Calculate total pages
  const totalPages = Math.ceil(totalCount / limit);

  // Get paginated notifications
  const notifications = await AdminNotification.find({
    module: { $in: access.modules },
    'recipients.adminId': adminId,
    'recipients.isDeleted': false,
  })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  return {
    notifications,
    pagination: {
      total: totalCount,
      page,
      limit,
      totalPages,
    },
  };
};

export const toggleNotificationReadStatus = async (adminId, notificationId) => {
  try {
    if (!adminId || !notificationId) {
      return {
        success: false,
        message: 'Admin ID and Notification ID are required.',
      };
    }

    // --- Fetch the notification first ---
    const notification = await AdminNotification.findOne({
      _id: notificationId,
      'recipients.adminId': adminId,
      'recipients.isDeleted': false,
    }).lean();

    if (!notification) {
      return {
        success: false,
        message: 'Notification not found for this admin.',
      };
    }

    // --- Find the recipient record for this admin ---
    const recipient = notification.recipients.find(
      (r) => r.adminId.toString() === adminId.toString(),
    );

    if (!recipient) {
      return {
        success: false,
        message: 'Recipient not found in this notification.',
      };
    }

    // --- Toggle the read status ---
    const newIsRead = !recipient.isRead;

    const result = await AdminNotification.updateOne(
      { _id: notificationId },
      {
        $set: {
          'recipients.$[r].isRead': newIsRead,
          'recipients.$[r].readAt': newIsRead ? new Date() : null,
        },
      },
      {
        arrayFilters: [{ 'r.adminId': adminId }],
      },
    );

    return {
      success: true,
      modifiedCount: result.modifiedCount,
      message: `Notification ${notificationId} marked as ${newIsRead ? 'read' : 'unread'} for admin ${adminId}.`,
      newStatus: newIsRead,
    };
  } catch (error) {
    console.error('Error toggling notification read status:', error);
    return {
      success: false,
      message: 'An error occurred while updating the notification.',
      error: error.message,
    };
  }
};

export const markAllNotificationsAsRead = async (adminId) => {
  try {
    if (!adminId) {
      return {
        success: false,
        message: 'Admin ID is required.',
      };
    }

    // --- Get current timestamp for readAt ---
    const readTimestamp = new Date();

    // --- Update all notifications where the admin is a recipient ---
    const result = await AdminNotification.updateMany(
      {
        'recipients.adminId': adminId,
        'recipients.isDeleted': false,
        'recipients.isRead': false, // Only update unread notifications
      },
      {
        $set: {
          'recipients.$[r].isRead': true,
          'recipients.$[r].readAt': readTimestamp,
        },
      },
      {
        arrayFilters: [
          {
            'r.adminId': adminId,
            'r.isDeleted': false,
            'r.isRead': false,
          },
        ],
      },
    );

    return {
      success: true,
      modifiedCount: result.modifiedCount,
      matchedCount: result.matchedCount,
      message: `Successfully marked ${result.modifiedCount} notifications as read for admin ${adminId}.`,
      readAt: readTimestamp,
    };
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    return {
      success: false,
      message: 'An error occurred while marking notifications as read.',
      error: error.message,
    };
  }
};

export const updateNotificationsAsDeleted = async (adminId) => {
  if (!adminId) {
    return { modifiedCount: 0, message: 'Admin ID is required.' };
  }

  const access = await AdminAccess.findOne({ admin: adminId })
    .select('modules')
    .lean();

  if (!access || !access.modules?.length) {
    return { modifiedCount: 0, message: 'No modules assigned to this admin.' };
  }

  const result = await AdminNotification.updateMany(
    {
      module: { $in: access.modules },
      'recipients.adminId': adminId,
      'recipients.isDeleted': false,
    },
    {
      $set: {
        'recipients.$.isDeleted': true,
      },
    },
  );

  return {
    acknowledged: result.acknowledged,
    modifiedCount: result.modifiedCount,
    message: `${result.modifiedCount} notifications marked as deleted for admin ${adminId}.`,
  };
};

export const updateNotificationsAsDeletedById = async (
  adminId,
  notificationId,
) => {
  if (!adminId || !notificationId) {
    return {
      modifiedCount: 0,
      message: 'Admin ID and Notification ID are required.',
    };
  }

  const access = await AdminAccess.findOne({ admin: adminId })
    .select('modules')
    .lean();

  if (!access || !access.modules?.length) {
    return {
      modifiedCount: 0,
      message: 'No modules assigned to this admin.',
    };
  }

  const result = await AdminNotification.updateOne(
    {
      _id: notificationId,
      module: { $in: access.modules },
      'recipients.adminId': adminId,
    },
    {
      $set: {
        'recipients.$[recipient].isDeleted': true,
        'recipients.$[recipient].deletedAt': new Date(),
      },
    },
    {
      arrayFilters: [
        { 'recipient.adminId': adminId, 'recipient.isDeleted': false },
      ],
    },
  );

  return {
    acknowledged: result.acknowledged,
    modifiedCount: result.modifiedCount,
    message:
      result.modifiedCount > 0
        ? `Notification ${notificationId} marked as deleted for admin ${adminId}.`
        : 'No notification found or it may already be deleted for this admin.',
  };
};

export const createAdminNotification = async ({
  title,
  message,
  metadata = {},
  module,
  type = 'ALERT',
  actionLink,
}) => {
  try {
    // --- Validation ---
    if (!title || !message || !module) {
      return {
        success: false,
        message: 'Title, message, and module are required.',
      };
    }

    // --- Fetch all admins who have access to this module ---
    const adminsWithAccess = await AdminAccess.find({
      modules: { $in: [module] },
    })
      .select('admin')
      .lean();

    if (!adminsWithAccess.length) {
      return {
        success: false,
        message: `No admins found with access to the module "${module}".`,
      };
    }

    // --- Build recipients array ---
    const recipients = adminsWithAccess.map((a) => ({
      adminId: a.admin,
      isRead: false,
      isDeleted: false,
    }));

    adminsWithAccess.forEach((a) => {
      emitToUser(a.admin, 'admin:new_notification', {
        title,
        message,
        metadata,
        module,
        type,
        actionLink,
      });
    });

    // --- Create notification ---
    const notification = await AdminNotification.create({
      title,
      message,
      type,
      module,
      metadata,
      actionLink,
      recipients,
    });

    return {
      success: true,
      message: `Notification created successfully for ${adminsWithAccess.length} admins in module "${module}".`,
      data: notification,
    };
  } catch (error) {
    console.error('Error creating admin notification:', error);
    return {
      success: false,
      message: 'An error occurred while creating the notification.',
      error: error.message,
    };
  }
};

export const findUserNotifications = async (userId) => {
  if (!userId) {
    throw new Error('User ID is required to fetch notifications.');
  }

  const notifications = await Notification.find({
    'recipient.userId': userId,
    'recipient.isDeleted': false,
  })
    .sort({ createdAt: -1 })
    .lean();

  return notifications;
};

export const toggleUserNotificationReadStatus = async (
  userId,
  notificationId,
) => {
  if (!mongoose.Types.ObjectId.isValid(notificationId)) {
    throw new Error('Invalid notification ID.');
  }
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error('Invalid user ID.');
  }

  const notification = await Notification.findOne({
    _id: notificationId,
    'recipient.userId': userId,
    'recipient.isDeleted': false,
  });

  if (!notification) {
    throw new Error('Notification not found or access denied.');
  }

  const isCurrentlyRead = notification.recipient.isRead;
  notification.recipient.isRead = !isCurrentlyRead;
  notification.recipient.readAt = isCurrentlyRead ? null : new Date();

  await notification.save();

  return notification;
};

export const deleteUserNotificationById = async (userId, notificationId) => {
  if (!mongoose.Types.ObjectId.isValid(notificationId)) {
    throw new Error('Invalid notification ID.');
  }
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error('Invalid user ID.');
  }

  const notification = await Notification.findOne({
    _id: notificationId,
    'recipient.userId': userId,
    'recipient.isDeleted': false,
  });

  if (!notification) {
    throw new Error('Notification not found or already deleted.');
  }

  notification.recipient.isDeleted = true;
  await notification.save();

  return notification;
};

export const deleteAllNotificationsForUser = async (userId) => {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error('Invalid user ID.');
  }

  const result = await Notification.updateMany(
    {
      'recipient.userId': userId,
      'recipient.isDeleted': false,
    },
    {
      $set: { 'recipient.isDeleted': true },
    },
  );

  return {
    acknowledged: result.acknowledged,
    modifiedCount: result.modifiedCount,
    message: result.modifiedCount
      ? `${result.modifiedCount} notifications marked as deleted for user ${userId}.`
      : 'Notifications not available',
  };
};

export const createUserNotification = async ({
  title,
  message,
  module,
  userId,
  metadata = {},
  type = 'ALERT',
  actionLink = null,
}) => {
  if (!title || !message || !module || !userId) {
    return {
      success: false,
      message: 'Title, message, module, and userId are required.',
    };
  }

  if (!ALLOWED_SETTINGS.includes(module)) {
    return {
      success: false,
      message: `Invalid module. Allowed values: ${ALLOWED_SETTINGS.join(', ')}`,
    };
  }

  // --- 3️⃣ Validate User ID ---
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return {
      success: false,
      message: 'Invalid userId. Must be a valid MongoDB ObjectId.',
    };
  }

  // --- 4️⃣ Construct Recipient ---
  const recipient = {
    userId: new mongoose.Types.ObjectId(userId),
    isRead: false,
    isDeleted: false,
    readAt: null,
  };

  // --- 5️⃣ Create Notification ---
  const notification = await Notification.create({
    title,
    message,
    module,
    type,
    actionLink,
    metadata,
    recipient,
  });

  return {
    success: true,
    message: 'Notification created successfully.',
    data: notification,
  };
};

export const sendPushNotification = async ({
  deviceToken,
  title,
  body,
  data = {},
  imageUrl = null,
}) => {
  try {
    if (!deviceToken) {
      throw new Error('Device token is required to send notification');
    }

    const message = {
      token: deviceToken,
      notification: {
        title,
        body,
        ...(imageUrl && { image: imageUrl }),
      },
      data: Object.keys(data).reduce((acc, key) => {
        acc[key] = String(data[key]); // FCM requires all data to be string
        return acc;
      }, {}),
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          channelId: 'high_importance_channel',
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
          },
        },
      },
    };

    const response = await firebaseAdmin.messaging().send(message);

    console.log(`Push notification sent successfully: ${response}`);
    return { success: true, response };
  } catch (error) {
    console.error(`Error sending push notification: ${error.message}`);
    return { success: false, error: error.message };
  }
};

export const notifyUser = async ({
  userId,
  title,
  message,
  module,
  metadata = {},
  type = 'ALERT',
  actionLink = null,
  storeInDB = true,
  isPush = true,
}) => {
  try {
    if (!title?.trim() || !message?.trim() || !module?.trim()) {
      return {
        success: false,
        message: 'userId, title, message, and module are required.',
      };
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return {
        success: false,
        message: 'Invalid userId. Must be a valid MongoDB ObjectId.',
      };
    }

    if (!ALLOWED_SETTINGS.includes(module)) {
      return {
        success: false,
        message: `Invalid module. Allowed values: ${ALLOWED_SETTINGS.join(', ')}`,
      };
    }

    // --- Fetch User and Notification Preferences ---
    const user = await User.findById(userId).lean();
    if (!user) {
      return { success: false, message: 'User not found.' };
    }

    // --- Create Notification in DB ---
    let notificationDoc = null;
    if (storeInDB) {
      const createdNotification = await createUserNotification({
        title,
        message,
        module,
        userId,
        metadata,
        type,
        actionLink,
      });

      if (!createdNotification.success) {
        return createdNotification;
      }

      notificationDoc = createdNotification.data;
    }

    // --- Check User Notification Preferences + Token ---
    if (isPush) {
      if (
        user.userDeviceToken &&
        user.notifications &&
        user.notifications[module] === true
      ) {
        const pushResponse = await sendPushNotification({
          deviceToken: user.userDeviceToken,
          title,
          body: message,
          data: {
            module,
            type,
            ...metadata,
          },
          imageUrl: actionLink || undefined,
        });

        return {
          success: true,
          message: 'Notification created and push sent successfully.',
          dbNotification: notificationDoc,
          pushNotification: pushResponse,
        };
      }
    }

    return {
      success: true,
      message:
        'Notification created but not sent (user disabled or missing device token).',
      dbNotification: notificationDoc,
    };
  } catch (error) {
    console.error('❌ Error in notifyUser:', error);
    return {
      success: false,
      message: 'Failed to send notification.',
      error: error.message,
    };
  }
};
