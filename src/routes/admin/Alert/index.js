import express from 'express';
import { registerRoute } from '../../../utils/registerRoute.js';
import {
  sendAlertController,
  getAllPassengersController,
  getAllDriversController,
  getAllAlertsController,
} from '../../../controllers/Admin/Alert/index.js';

const router = express.Router();

registerRoute({
  router,
  route: '/send',
  admin_auth_enable: true,
  post_permission: 'advertising_management',
  post_method: sendAlertController,
});

registerRoute({
  router,
  route: '/passengers',
  admin_auth_enable: true,
  get_permission: 'advertising_management',
  get_method: getAllPassengersController,
});

registerRoute({
  router,
  route: '/drivers',
  admin_auth_enable: true,
  get_permission: 'advertising_management',
  get_method: getAllDriversController,
});

registerRoute({
  router,
  route: '/',
  admin_auth_enable: true,
  get_permission: 'advertising_management',
  get_method: getAllAlertsController,
});

export default router;
