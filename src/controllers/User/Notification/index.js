import { handleResponse } from '../../../utils/handleRespone.js';
import {
  getNotificationSettings,
  toggleNotification,
  getNotifications,
  toggleNotificationStatus,
  deleteNotificationById,
  deleteNotifications,
  markAllNotificationsAsRead,
} from '../../../services/User/Notification/index.js';
import {
  validateNotificationSettingName,
  validateObjectId,
} from '../../../validations/notification.js';

export const getNotificationSettingsController = (req, res) =>
  handleResponse(
    {
      handler: getNotificationSettings,
      validationFn: null,
      handlerParams: [req.user],
      successMessage: 'Notification settings fetched successfully',
    },
    req,
    res,
  );

export const toggleNotificationController = (req, res) =>
  handleResponse(
    {
      handler: toggleNotification,
      validationFn: () => validateNotificationSettingName(req.query),
      handlerParams: [req.user, req.query],
      successMessage: 'Notification toggled successfully',
    },
    req,
    res,
  );

export const getNotificationsController = (req, res) =>
  handleResponse(
    {
      handler: getNotifications,
      validationFn: null,
      handlerParams: [req.user, req.query],
      successMessage: 'Notifications fetched successfully',
    },
    req,
    res,
  );

export const toggleNotificationStatusController = (req, res) =>
  handleResponse(
    {
      handler: toggleNotificationStatus,
      validationFn: () => validateObjectId(req.params),
      handlerParams: [req.user, req.params],
      successMessage: 'Notifications toggled successfully',
    },
    req,
    res,
  );

export const deleteNotificationByIdController = (req, res) =>
  handleResponse(
    {
      handler: deleteNotificationById,
      validationFn: () => validateObjectId(req.params),
      handlerParams: [req.user, req.params],
      successMessage: 'Notification deleted successfully',
    },
    req,
    res,
  );

export const markAllNotificationsAsReadController = (req, res) =>
  handleResponse(
    {
      handler: markAllNotificationsAsRead,
      validationFn: null,
      handlerParams: [req.user],
      successMessage: 'All notifications marked as read successfully',
    },
    req,
    res,
  );

export const deleteNotificationsController = (req, res) =>
  handleResponse(
    {
      handler: deleteNotifications,
      validationFn: null,
      handlerParams: [req.user],
      successMessage: 'Notifications deleted successfully',
    },
    req,
    res,
  );
