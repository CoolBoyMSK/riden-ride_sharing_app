import { handleResponse } from '../../../utils/handleRespone.js';
import {
  getAllNotifications,
  readNotifications,
  deleteNotifications,
  deleteNotificationById,
} from '../../../services/Admin/Notification/index.js';

export const getAllNotificationsController = (req, res) =>
  handleResponse(
    {
      handler: getAllNotifications,
      validationFn: null,
      handlerParams: [req.user],
      successMessage: 'Admin notifications fetched successfully',
    },
    req,
    res,
  );

export const readNotificationsController = (req, res) =>
  handleResponse(
    {
      handler: readNotifications,
      validationFn: null,
      handlerParams: [req.user],
      successMessage: 'Admin notifications read successfully',
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
      successMessage: 'Admin notifications deleted successfully',
    },
    req,
    res,
  );

export const deleteNotificationByIdController = (req, res) =>
  handleResponse(
    {
      handler: deleteNotificationById,
      validationFn: null,
      handlerParams: [req.user, req.params],
      successMessage: 'Admin notification deleted successfully',
    },
    req,
    res,
  );
