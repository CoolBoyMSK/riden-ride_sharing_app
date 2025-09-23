import { handleResponse } from '../../../utils/handleRespone.js';
import {
  getNotificationSettings,
  toggleNotification,
} from '../../../services/User/Notification/index.js';

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
      validationFn: null,
      handlerParams: [req.user, req.query],
      successMessage: 'Notification toggled successfully',
    },
    req,
    res,
  );
