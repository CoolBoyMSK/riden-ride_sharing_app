import express from 'express';
import {
  addFareController,
  getAllFaresController,
  getAllFareByIdController,
  updateFareController,
  deleteFareController,
} from '../../../controllers/Admin/fareManagement/index.js';
import { registerRoute } from '../../../utils/registerRoute.js';

const router = express.Router();

registerRoute({
  router,
  route: '/',
  admin_auth_enable: true,
  get_method: getAllFaresController,
  get_permission: 'fare_management',
  post_method: addFareController,
  post_permission: 'fare_management',
});

registerRoute({
  router,
  route: '/:id',
  admin_auth_enable: true,
  get_method: getAllFareByIdController,
  get_permission: 'fare_management',
});

registerRoute({
  router,
  route: '/:carType',
  admin_auth_enable: true,
  put_method: updateFareController,
  put_permission: 'fare_management',
});

registerRoute({
  router,
  route: '/delete',
  admin_auth_enable: true,
  delete_method: deleteFareController,
  delete_permission: 'fare_management',
});

export default router;
