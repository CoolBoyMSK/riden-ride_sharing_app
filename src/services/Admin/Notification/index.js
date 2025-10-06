import {
  findAdminNotifications,
  toggleNotificationReadStatus,
  updateNotificationsAsDeleted,
  updateNotificationsAsDeletedById,
} from '../../../dal/notification.js';

export const getAllNotifications = async (user, resp) => {
  try {
    const success = await findAdminNotifications(user._id);
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

export const readNotifications = async (user, { id }, resp) => {
  try {
    const success = await toggleNotificationReadStatus(user._id, id);
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to read notifications';
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
    const success = await updateNotificationsAsDeleted(user._id);
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

export const deleteNotificationById = async (user, { id }, resp) => {
  try {
    const success = await updateNotificationsAsDeletedById(user._id, id);
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
