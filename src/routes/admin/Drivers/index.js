import express from 'express';
import { registerRoute } from '../../../utils/registerRoute.js';
import {
  fetchAllDrivers,
  suspendDriverController,
  unsuspendDriverController,
} from '../../../controllers/Admin/Drivers/index.js';

const router = express.Router();

registerRoute({
  router,
  route: '/fetch-drivers',
  admin_auth_enable: true,
  get_permission: 'driver_management',
  get_method: fetchAllDrivers,
});

registerRoute({
  router,
  route: '/:id/suspend',
  admin_auth_enable: true,
  post_permission: 'driver_management',
  post_method: suspendDriverController,
});

registerRoute({
  router,
  route: '/:id/unsuspend',
  admin_auth_enable: true,
  patch_permission: 'driver_management',
  patch_method: unsuspendDriverController,
});

export default router;
