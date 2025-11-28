import express from 'express';
import { registerRoute } from '../../../../utils/registerRoute.js';
import { uploadSingle } from '../../../../middlewares/upload.js';
import {
  addPayoutMethodController,
  onBoardDriverController,
  driverIdentityVerificationController,
  sendAdditionalDocumentController,
  sendLicenseFrontController,
  sendLicenseBackController,
  getIdentityVerificationStatusController,
  getConnectedAccountStatusController,
  getDriverStripeAccountController,
  getAllPayoutMethodsController,
  getPayoutMethodByIdController,
  deletePayoutMethodController,
  setDefaultPayoutMethodController,
  sendInstantPayoutRequestController,
  sendPayoutToDriverBankController,
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
  route: '/onboard',
  driver_auth_enable: true,
  post_method: onBoardDriverController,
});

registerRoute({
  router,
  route: '/verify',
  driver_auth_enable: true,
  post_method: driverIdentityVerificationController,
});

registerRoute({
  router,
  route: '/upload',
  driver_auth_enable: true,
  post_middlewares: [uploadSingle],
  post_method: sendAdditionalDocumentController,
});

registerRoute({
  router,
  route: '/license-front',
  driver_auth_enable: true,
  post_middlewares: [uploadSingle],
  post_method: sendLicenseFrontController,
});

registerRoute({
  router,
  route: '/license-back',
  driver_auth_enable: true,
  post_middlewares: [uploadSingle],
  post_method: sendLicenseBackController,
});

registerRoute({
  router,
  route: '/identity-status',
  driver_auth_enable: true,
  post_method: getIdentityVerificationStatusController,
});

registerRoute({
  router,
  route: '/status',
  driver_auth_enable: true,
  post_method: getConnectedAccountStatusController,
});

registerRoute({
  router,
  route: '/create',
  driver_auth_enable: true,
  post_method: getDriverStripeAccountController,
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

registerRoute({
  router,
  route: '/request',
  driver_auth_enable: true,
  post_method: sendInstantPayoutRequestController,
});

registerRoute({
  router,
  route: '/transfer',
  driver_auth_enable: true,
  post_method: sendPayoutToDriverBankController,
});
export default router;
