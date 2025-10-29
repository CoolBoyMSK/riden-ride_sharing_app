import express from 'express';
import { registerRoute } from '../../../utils/registerRoute.js';
import {
  getAllNotificationsController,
  getUnreadNotificationsCountController,
  readNotificationsController,
  deleteNotificationsController,
  deleteNotificationByIdController,
} from '../../../controllers/Admin/Notification/index.js';

const router = express.Router();

registerRoute({
  router,
  route: '/',
  admin_auth_enable: true,
  get_permission: 'notifications',
  get_method: getAllNotificationsController,
});

registerRoute({
  router,
  route: '/count',
  admin_auth_enable: true,
  get_permission: 'notifications',
  get_method: getUnreadNotificationsCountController,
});

registerRoute({
  router,
  route: '/read/:id',
  admin_auth_enable: true,
  post_permission: 'notifications',
  post_method: readNotificationsController,
});

registerRoute({
  router,
  route: '/delete',
  admin_auth_enable: true,
  delete_permission: 'notifications',
  delete_method: deleteNotificationsController,
});

registerRoute({
  router,
  route: '/delete/:id',
  admin_auth_enable: true,
  delete_permission: 'notifications',
  delete_method: deleteNotificationByIdController,
});

export default router;
