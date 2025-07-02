import express from 'express';
import { registerRoute } from '../../../utils/registerRoute.js';
import {
  confirmAdminPasswordReset,
  getCurrentAdmin,
  loginAdmin,
  refreshAdmin,
  requestAdminPasswordReset,
} from '../../../controllers/Admin/Auth/index.controller.js';

const router = express.Router();

registerRoute({
  router,
  route: '/login',
  post_method: loginAdmin,
});

registerRoute({
  router,
  route: '/refresh',
  post_method: refreshAdmin,
});

registerRoute({
  router,
  route: '/me',
  admin_auth_enable: true,
  get_method: getCurrentAdmin,
});

registerRoute({
  router,
  route: '/password-reset',
  post_method: requestAdminPasswordReset,
});

registerRoute({
  router,
  route: '/password-reset/confirm',
  post_method: confirmAdminPasswordReset,
});
export default router;
