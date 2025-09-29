import express from 'express';
import { registerRoute } from '../../../utils/registerRoute.js';
import { getGenericAnalyticsController } from '../../../controllers/Admin/Analytics/index.js';

const router = express.Router();

registerRoute({
  router,
  route: '/',
  admin_auth_enable: true,
  get_permission: 'analytics',
  get_method: getGenericAnalyticsController,
});

export default router;
