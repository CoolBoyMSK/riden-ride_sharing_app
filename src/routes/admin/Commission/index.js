import express from 'express';
import { registerRoute } from '../../../utils/registerRoute.js';
import {
  setCommissionController,
  getCommissionsController,
  getAdminCommissionsController,
  getCommissionStatsController,
} from '../../../controllers/Admin/Commission/index.js';

const router = express.Router();

registerRoute({
  router,
  route: '/set',
  admin_auth_enable: true,
  post_permission: 'commission_management',
  post_method: setCommissionController,
});

registerRoute({
  router,
  route: '/',
  admin_auth_enable: true,
  get_permission: 'commission_management',
  get_method: getCommissionsController,
});

registerRoute({
  router,
  route: '/get',
  admin_auth_enable: true,
  get_permission: 'commission_management',
  get_method: getAdminCommissionsController,
});

registerRoute({
  router,
  route: '/stats',
  admin_auth_enable: true,
  get_permission: 'commission_management',
  get_method: getCommissionStatsController,
});

export default router;
