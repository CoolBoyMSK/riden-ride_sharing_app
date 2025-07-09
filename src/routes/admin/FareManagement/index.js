import express from 'express';
import {
  createFare,
  listFares,
  getFare,
  replaceFare,
  modifyDailyFare,
  removeFare,
} from '../../../controllers/Admin/fareManagement/index.js';
import { registerRoute } from '../../../utils/registerRoute.js';

const router = express.Router();

registerRoute({
  router,
  route: '/',
  admin_auth_enable: true,
  get_method: listFares,
  get_permission: 'fare_management',
  post_method: createFare,
  post_permission: 'fare_management',
});

registerRoute({
  router,
  route: '/:carType',
  admin_auth_enable: true,
  get_method: getFare,
  get_permission: 'fare_management',
  put_method: replaceFare,
  put_permission: 'fare_management',
  delete_method: removeFare,
  delete_permission: 'fare_management',
});

registerRoute({
  router,
  route: '/:carType/day/:day',
  admin_auth_enable: true,
  patch_method: modifyDailyFare,
  patch_permission: 'fare_management',
});

export default router;
