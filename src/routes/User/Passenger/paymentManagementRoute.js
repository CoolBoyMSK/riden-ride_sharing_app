import express from 'express';
import {
  addPaymentMethodController,
  setDefaultPaymentMethodController,
  getPaymentMethodsController,
  getPaymentMethodByIdController,
  updatePaymentMethodController,
  deletePaymentMethodController,
  topUpInAppWalletController,
  getInAppWalletController,
  getTransactionsController,
} from '../../../controllers/User/Passengers/paymentManagementController.js';
import { registerRoute } from '../../../utils/registerRoute.js';

const router = express.Router();

registerRoute({
  router,
  route: '/get',
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
  route: '/get/:paymentMethodId',
  passenger_auth_enable: true,
  get_method: getPaymentMethodByIdController,
});

registerRoute({
  router,
  route: '/fund/:paymentMethodId',
  passenger_auth_enable: true,
  put_method: topUpInAppWalletController,
});

registerRoute({
  router,
  route: '/set/:paymentMethodId',
  passenger_auth_enable: true,
  put_method: setDefaultPaymentMethodController,
});

registerRoute({
  router,
  route: '/edit/:paymentMethodId',
  passenger_auth_enable: true,
  put_method: updatePaymentMethodController,
});

registerRoute({
  router,
  route: '/delete/:paymentMethodId',
  passenger_auth_enable: true,
  delete_method: deletePaymentMethodController,
});

registerRoute({
  router,
  route: '/wallet',
  passenger_auth_enable: true,
  get_method: getInAppWalletController,
});

registerRoute({
  router,
  route: '/transactions',
  passenger_auth_enable: true,
  get_method: getTransactionsController,
});

export default router;
