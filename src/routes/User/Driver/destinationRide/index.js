import express from 'express';
import { registerRoute } from '../../../../utils/registerRoute.js';
import {
  setDestinationRideController,
  getDestinationRideController,
  updateDestinationRideController,
  removeDestinationRideController,
} from '../../../../controllers/User/Drivers/destinationRide/index.js';

const router = express.Router();

registerRoute({
  router,
  route: '/set',
  driver_auth_enable: true,
  post_method: setDestinationRideController,
});

registerRoute({
  router,
  route: '/get',
  driver_auth_enable: true,
  get_method: getDestinationRideController,
});

registerRoute({
  router,
  route: '/update',
  driver_auth_enable: true,
  put_method: updateDestinationRideController,
});

registerRoute({
  router,
  route: '/remove',
  driver_auth_enable: true,
  delete_method: removeDestinationRideController,
});

export default router;




