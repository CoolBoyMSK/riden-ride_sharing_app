import User from '../models/User.js';
import Admin from '../models/Admin.js';
import AdminNotification from '../models/AdminNotification.js';
import AdminAccess from '../models/AdminAccess.js';

export const findNotificationSettings = (id) =>
  User.findById(id).select('notifications').lean();

export const updateNotificaition = (id, payload) =>
  User.findByIdAndUpdate(id, payload, { new: true })
    .select('notifications')
    .lean();

export const findAdminNotifications = async (adminId) => {
  const access = await AdminAccess.findOne({ admin: adminId })
    .select('modules')
    .lean();

  if (!access || !access.modules?.length) {
    return [];
  }

  const notifications = await AdminNotification.find({
    module: { $in: access.modules },
    'recipients.adminId': adminId,
    'recipients.isDeleted': false,
  })
    .sort({ createdAt: -1 })
    .lean();

  return notifications;
};

export const updateNotificationAsRead = async (adminId) => {
  const access = await AdminAccess.findOne({ admin: adminId })
    .select('modules')
    .lean();

  if (!access || !access.modules?.length) {
    return { modifiedCount: 0, message: 'No modules found for this admin.' };
  }

  const result = await AdminNotification.updateMany(
    {
      module: { $in: access.modules },
      'recipients.adminId': adminId,
      'recipients.isDeleted': false,
      'recipients.isRead': false,
    },
    {
      $set: {
        'recipients.$.isRead': true,
        'recipients.$.readAt': new Date(),
      },
    },
  );

  return {
    acknowledged: result.acknowledged,
    modifiedCount: result.modifiedCount,
    message: `${result.modifiedCount} notifications marked as read for admin ${adminId}.`,
  };
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
      modules: module,
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
