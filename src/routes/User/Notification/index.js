import express from 'express';
import { registerRoute } from '../../../utils/registerRoute.js';
import {
  getNotificationSettingsController,
  toggleNotificationController,
  getNotificationsController,
  toggleNotificationStatusController,
  deleteNotificationByIdController,
  deleteNotificationsController,
  markAllNotificationsAsReadController,
} from '../../../controllers/User/Notification/index.js';
import { anyUserAuth } from '../../../middlewares/anyUserAuth.js';

const router = express.Router();

registerRoute({
  router,
  route: '/',
  get_middlewares: [anyUserAuth],
  get_method: getNotificationSettingsController,
  put_middlewares: [anyUserAuth],
  put_method: toggleNotificationController,
});

registerRoute({
  router,
  route: '/all',
  get_middlewares: [anyUserAuth],
  get_method: getNotificationsController,
});

registerRoute({
  router,
  route: '/toggle/:id',
  put_middlewares: [anyUserAuth],
  put_method: toggleNotificationStatusController,
});

registerRoute({
  router,
  route: '/mark-all-read',
  passenger_auth_enable: true,
  driver_auth_enable: true,
  put_method: markAllNotificationsAsReadController,
});

registerRoute({
  router,
  route: '/delete/:id',
  delete_middlewares: [anyUserAuth],
  delete_method: deleteNotificationByIdController,
});

registerRoute({
  router,
  route: '/delete',
  delete_middlewares: [anyUserAuth],
  delete_method: deleteNotificationsController,
});

export default router;
