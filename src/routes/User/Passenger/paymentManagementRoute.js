import express from 'express';
import {
  addPaymentMethodController,
  setDefaultPaymentMethodController,
  getPaymentMethodsController,
  deletePaymentMethodController,
} from '../../../controllers/User/Passengers/paymentManagementController.js';
import { registerRoute } from '../../../utils/registerRoute.js';

const router = express.Router();

registerRoute({
  router,
  route: '/',
  passenger_auth_enable: true,
  get_method: getPaymentMethodsController,
});

registerRoute({
  router,
  route: '/add',
  passenger_auth_enable: true,
  post_method: addPaymentMethodController,
});

registerRoute({
  router,
  route: '/set-default',
  passenger_auth_enable: true,
  put_method: setDefaultPaymentMethodController,
});

registerRoute({
  router,
  route: '/delete',
  passenger_auth_enable: true,
  delete_method: deletePaymentMethodController,
});

export default router;
