import express from 'express';
import { registerRoute } from '../../../utils/registerRoute.js';
import { sendAlertController } from '../../../controllers/Admin/Alert/index.js';

const router = express.Router();

registerRoute({
  router,
  route: '/send',
  admin_auth_enable: true,
  post_permission: 'advertising_management',
  post_method: sendAlertController,
});

export default router;
