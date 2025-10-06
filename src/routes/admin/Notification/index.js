import express from 'express';
import { registerRoute } from '../../../utils/registerRoute.js';
import {
  getAllNotificationsController,
  readNotificationsController,
  deleteNotificationsController,
  deleteNotificationByIdController,
} from '../../../controllers/Admin/Notification/index.js';

const router = express.Router();

registerRoute({
  router,
  route: '/',
  admin_auth_enable: true,
  get_method: getAllNotificationsController,
});

registerRoute({
  router,
  route: '/read/:id',
  admin_auth_enable: true,
  post_method: readNotificationsController,
});

registerRoute({
  router,
  route: '/delete',
  admin_auth_enable: true,
  delete_method: deleteNotificationsController,
});

registerRoute({
  router,
  route: '/delete/:id',
  admin_auth_enable: true,
  delete_method: deleteNotificationByIdController,
});

export default router;
