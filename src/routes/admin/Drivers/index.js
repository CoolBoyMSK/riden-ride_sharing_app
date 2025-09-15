import express from 'express';
import { registerRoute } from '../../../utils/registerRoute.js';
import {
  fetchAllDrivers,
  suspendDriverController,
  unsuspendDriverController,
  deleteDriverByIdAPIController,
  findDriverByIdController,
  updateDriverDocumentStatusController,
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

registerRoute({
  router,
  route: '/delete/:driverId',
  admin_auth_enable: true,
  delete_permission: 'driver_management',
  delete_method: deleteDriverByIdAPIController,
});

registerRoute({
  router,
  route: '/fetch/:driverId',
  admin_auth_enable: true,
  get_permission: 'driver_management',
  get_method: findDriverByIdController,
});

registerRoute({
  router,
  route: '/document',
  admin_auth_enable: true,
  patch_permission: 'driver_management',
  patch_method: updateDriverDocumentStatusController,
});

export default router;
