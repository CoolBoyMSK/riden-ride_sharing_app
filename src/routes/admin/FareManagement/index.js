import express from 'express';
import {
  addFareController,
  getAllFaresController,
  getAllFareByIdController,
  updateFareController,
  deleteFareController,
  addDefaultFareController,
  getDefaultFareController,
  updateDefaultFareController,
  fetchCarTypesController,
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
  route: '/get',
  admin_auth_enable: true,
  get_method: getAllFareByIdController,
  get_permission: 'fare_management',
});

registerRoute({
  router,
  route: '/update',
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

registerRoute({
  router,
  route: '/default',
  admin_auth_enable: true,
  get_method: getDefaultFareController,
  get_permission: 'fare_management',
});

registerRoute({
  router,
  route: '/add/default',
  admin_auth_enable: true,
  post_method: addDefaultFareController,
  post_permission: 'fare_management',
});

registerRoute({
  router,
  route: '/update/default',
  admin_auth_enable: true,
  put_method: updateDefaultFareController,
  put_permission: 'fare_management',
});

registerRoute({
  router,
  route: '/types',
  admin_auth_enable: true,
  get_method: fetchCarTypesController,
  get_permission: 'fare_management',
});

export default router;
