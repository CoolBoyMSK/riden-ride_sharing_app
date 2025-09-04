import express from 'express';
import {
  addAddressController,
  updateAddressController,
  deleteAddressController,
} from '../../../controllers/User/Passengers/addressManagementController.js';
import { registerRoute } from '../../../utils/registerRoute.js';

const router = express.Router();

registerRoute({
  router,
  route: '/add',
  passenger_auth_enable: true,
  post_method: addAddressController,
});

registerRoute({
  router,
  route: '/update',
  passenger_auth_enable: true,
  patch_method: updateAddressController,
});

registerRoute({
  router,
  route: '/delete',
  passenger_auth_enable: true,
  patch_method: deleteAddressController,
});

export default router;
