import express from 'express';
import { registerRoute } from '../../../utils/registerRoute.js';
import {
  getCurrentAdmin,
  loginAdmin,
  refreshAdmin,
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

export default router;
