import {
  findNotificationSettings,
  updateNotificaition,
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

    console.log(isUser);

    const settings = await findNotificationSettings(isUser.userId._id);
    if (!settings) {
      resp.error = true;
      resp.error_message = 'Failed to fetch settings';
      return resp;
    }

    console.log(settings);

    resp.data = settings;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message =
      'Something went wrong while getting notification settings';
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
    resp.error_message = 'Something went wrong while toggleing notification';
    return resp;
  }
};
