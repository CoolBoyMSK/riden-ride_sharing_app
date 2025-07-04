import express from 'express';
import { registerRoute } from '../../../utils/registerRoute.js';
import {
  blockPassengerController,
  fetchAllPassengers,
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
