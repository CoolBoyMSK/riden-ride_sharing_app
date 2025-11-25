import express from 'express';
import {
  addCardSetupIntentController,
  addCardController,
  setDefaultCardController,
  getCardsController,
  getCardByIdController,
  deleteCardController,
  topUpInAppWalletController,
  getInAppWalletController,
  getTransactionsController,
  createWalletSetupIntentController,
  deleteWalletController,
} from '../../../controllers/User/Passengers/paymentManagementController.js';
import { registerRoute } from '../../../utils/registerRoute.js';

const router = express.Router();

registerRoute({
  router,
  route: '/card/intent',
  passenger_auth_enable: true,
  post_method: addCardSetupIntentController,
});

registerRoute({
  router,
  route: '/card/add',
  passenger_auth_enable: true,
  post_method: addCardController,
});

registerRoute({
  router,
  route: '/card/get',
  passenger_auth_enable: true,
  get_method: getCardsController,
});

registerRoute({
  router,
  route: '/card/get/:paymentMethodId',
  passenger_auth_enable: true,
  get_method: getCardByIdController,
});

registerRoute({
  router,
  route: '/card/delete/:paymentMethodId',
  passenger_auth_enable: true,
  delete_method: deleteCardController,
});

registerRoute({
  router,
  route: '/card/default/:paymentMethodId',
  passenger_auth_enable: true,
  put_method: setDefaultCardController,
});

registerRoute({
  router,
  route: '/fund/:paymentMethodId',
  passenger_auth_enable: true,
  put_method: topUpInAppWalletController,
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

registerRoute({
  router,
  route: '/wallet/intent',
  passenger_auth_enable: true,
  post_method: createWalletSetupIntentController,
});

registerRoute({
  router,
  route: '/wallet/delete',
  passenger_auth_enable: true,
  delete_method: deleteWalletController,
});

export default router;
