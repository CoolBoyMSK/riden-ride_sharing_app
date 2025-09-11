import express from 'express';
import { registerRoute } from '../../../utils/registerRoute.js';
import {
  blockPassengerController,
  fetchAllPassengers,
  getPassengerByIdController,
  deletePassengerByIdController,
  unblockPassengerController,
} from '../../../controllers/Admin/Passengers/index.js';

const router = express.Router();

registerRoute({
  router,
  route: '/fetch-passengers',
  admin_auth_enable: true,
  get_permission: 'passenger_management',
  get_method: fetchAllPassengers,
});

registerRoute({
  router,
  route: '/fetch-passenger/:passengerId',
  admin_auth_enable: true,
  get_permission: 'passenger_management',
  get_method: getPassengerByIdController,
});

registerRoute({
  router,
  route: '/delete-passenger/:passengerId',
  admin_auth_enable: true,
  delete_permission: 'passenger_management',
  delete_method: deletePassengerByIdController,
});

registerRoute({
  router,
  route: '/:id/block',
  admin_auth_enable: true,
  patch_permission: 'passenger_management',
  patch_method: blockPassengerController,
});

registerRoute({
  router,
  route: '/:id/unblock',
  admin_auth_enable: true,
  patch_permission: 'passenger_management',
  patch_method: unblockPassengerController,
});

export default router;
