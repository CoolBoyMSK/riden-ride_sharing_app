import {
  findNotificationSettings,
  updateNotificaition,
  findUserNotifications,
  toggleUserNotificationReadStatus,
  deleteUserNotificationById,
  deleteAllNotificationsForUser,
} from '../../../dal/notification.js';
import { findUserById } from '../../../dal/user/index.js';

export const getNotificationSettings = async (user, resp) => {
  try {
    const isUser = await findUserById(user.id);
    if (!isUser) {
      resp.error = true;
      resp.error_message = 'Failed to fetch User';
      return resp;
    }

    const settings = await findNotificationSettings(isUser.userId._id);
    if (!settings) {
      resp.error = true;
      resp.error_message = 'Failed to fetch settings';
      return resp;
    }

    resp.data = settings;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'Something went wrong';
    return resp;
  }
};

export const toggleNotification = async (user, { type }, resp) => {
  try {
    const isUser = await findUserById(user.id);
    if (!isUser) {
      resp.error = true;
      resp.error_message = 'Failed to fetch User';
      return resp;
    }

    const path = `notifications.${type}`;
    const success = await updateNotificaition(isUser.userId._id, [
      {
        $set: {
          [path]: { $not: `$${path}` },
        },
      },
    ]);
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to toggle setting';
      return resp;
    }

    resp.data = success;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'Something went wrong';
    return resp;
  }
};

export const getNotifications = async (
  user,
  { page = 1, limit = 10 },
  resp,
) => {
  try {
    const success = await findUserNotifications(user.id, {
      page,
      limit,
    });
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to fetch notifications';
      return resp;
    }

    resp.data = success;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'Something went wrong';
    return resp;
  }
};

export const toggleNotificationStatus = async (user, { id }, resp) => {
  try {
    const success = await toggleUserNotificationReadStatus(user.id, id);
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to toggle notification status';
      return resp;
    }

    resp.data = success;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'Something went wrong';
    return resp;
  }
};

export const deleteNotificationById = async (user, { id }, resp) => {
  try {
    const success = await deleteUserNotificationById(user.id, id);
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to delete notification';
      return resp;
    }

    resp.data = success;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'Something went wrong';
    return resp;
  }
};

export const deleteNotifications = async (user, resp) => {
  try {
    const success = await deleteAllNotificationsForUser(user.id);
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to delete notifications';
      return resp;
    }

    resp.data = success;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'Something went wrong';
    return resp;
  }
};
