import express from 'express';
import { registerRoute } from '../../../../utils/registerRoute.js';
import {
  addPayoutMethodController,
  getAllPayoutMethodsController,
  getPayoutMethodByIdController,
  updatePayoutMethodController,
  deletePayoutMethodController,
  setDefaultPayoutMethodController,
} from '../../../../controllers/User/Drivers/payment/index.js';

const router = express.Router();

registerRoute({
  router,
  route: '/add',
  driver_auth_enable: true,
  post_method: addPayoutMethodController,
});

registerRoute({
  router,
  route: '/get',
  driver_auth_enable: true,
  get_method: getAllPayoutMethodsController,
});

registerRoute({
  router,
  route: '/get/:id',
  driver_auth_enable: true,
  get_method: getPayoutMethodByIdController,
});

registerRoute({
  router,
  route: '/edit/:id',
  driver_auth_enable: true,
  put_method: updatePayoutMethodController,
});

registerRoute({
  router,
  route: '/delete/:id',
  driver_auth_enable: true,
  delete_method: deletePayoutMethodController,
});

registerRoute({
  router,
  route: '/set/:id',
  driver_auth_enable: true,
  put_method: setDefaultPayoutMethodController,
});

export default router;
