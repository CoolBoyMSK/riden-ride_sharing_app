import express from 'express';
import { registerRoute } from '../../../../utils/registerRoute.js';
import {
  addDestinationController,
  fetchDestinationsController,
  fetchDestinationByIdController,
  editDestinationController,
  deleteDestinationController,
} from '../../../../controllers/User/Drivers/destination/index.js';

const router = express.Router();

registerRoute({
  router,
  route: '/add',
  driver_auth_enable: true,
  post_method: addDestinationController,
});

registerRoute({
  router,
  route: '/get',
  driver_auth_enable: true,
  get_method: fetchDestinationsController,
});

registerRoute({
  router,
  route: '/get/:id',
  driver_auth_enable: true,
  get_method: fetchDestinationByIdController,
});

registerRoute({
  router,
  route: '/edit/:id',
  driver_auth_enable: true,
  put_method: editDestinationController,
});

registerRoute({
  router,
  route: '/delete/:id',
  driver_auth_enable: true,
  delete_method: deleteDestinationController,
});

export default router;
