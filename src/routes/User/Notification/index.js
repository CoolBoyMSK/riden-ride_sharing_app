import express from 'express';
import { registerRoute } from '../../../utils/registerRoute.js';
import {
  getNotificationSettingsController,
  toggleNotificationController,
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

export default router;
