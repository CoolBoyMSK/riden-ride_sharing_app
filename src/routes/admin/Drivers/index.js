import express from 'express';
import { registerRoute } from '../../../utils/registerRoute.js';
import {
  fetchAllDrivers,
  suspendDriverController,
  unsuspendDriverController,
  deleteDriverByIdAPIController,
  findDriverByIdController,
  updateDriverDocumentStatusController,
  blockDriverController,
  unblockDriverController,
  getAllUpdateRequestsController,
  toggleUpdateRequestController,
  approveRequestedDriverController,
  uploadWayBillDocumentController,
  getWayBillDocumentController,
  resetDriverDestinationRideLimitController,
  getDriverDestinationRideStatusController,
} from '../../../controllers/Admin/Drivers/index.js';
import { uploadSingle } from '../../../middlewares/upload.js';

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

registerRoute({
  router,
  route: '/:driverId/block',
  admin_auth_enable: true,
  patch_permission: 'driver_management',
  patch_method: blockDriverController,
});

registerRoute({
  router,
  route: '/:driverId/unblock',
  admin_auth_enable: true,
  patch_permission: 'driver_management',
  patch_method: unblockDriverController,
});

registerRoute({
  router,
  route: '/update-requests',
  admin_auth_enable: true,
  get_permission: 'driver_management',
  get_method: getAllUpdateRequestsController,
  put_permission: 'driver_management',
  put_method: toggleUpdateRequestController,
});

registerRoute({
  router,
  route: '/approve/:id',
  admin_auth_enable: true,
  put_permission: 'driver_management',
  put_method: approveRequestedDriverController,
});

registerRoute({
  router,
  route: '/waybill',
  admin_auth_enable: true,
  put_middlewares: [uploadSingle],
  put_permission: 'driver_management',
  put_method: uploadWayBillDocumentController,
  get_permission: 'driver_management',
  get_method: getWayBillDocumentController,
});

registerRoute({
  router,
  route: '/:driverId/destination-ride-status',
  admin_auth_enable: true,
  get_permission: 'driver_management',
  get_method: getDriverDestinationRideStatusController,
});

registerRoute({
  router,
  route: '/:driverId/reset-destination-ride-limit',
  admin_auth_enable: true,
  post_permission: 'driver_management',
  post_method: resetDriverDestinationRideLimitController,
});

export default router;
