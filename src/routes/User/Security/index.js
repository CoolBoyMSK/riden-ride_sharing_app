import express from 'express';
import { registerRoute } from '../../../utils/registerRoute.js';
import {
  createRecoveryNumberController,
  getRecoveryNumbersController,
  editRecoveryNumberController,
  removeRecoveryNumberController,
  fetchPasskeyRegisterOptionsController,
  verifyAndSavePasskeyInDbController,
  toggle2FAStatusController,
  getUserDevicesController,
} from '../../../controllers/User/Security/index.js';

const router = express.Router();

registerRoute({
  router,
  route: '/get',
  driver_auth_enable: true,
  get_method: getRecoveryNumbersController,
});

registerRoute({
  router,
  route: '/add',
  driver_auth_enable: true,
  post_method: createRecoveryNumberController,
});

registerRoute({
  router,
  route: '/edit',
  driver_auth_enable: true,
  put_method: editRecoveryNumberController,
});

registerRoute({
  router,
  route: '/delete',
  driver_auth_enable: true,
  delete_method: removeRecoveryNumberController,
});

registerRoute({
  router,
  route: '/passkey/register-options',
  driver_auth_enable: true,
  post_method: fetchPasskeyRegisterOptionsController,
});

registerRoute({
  router,
  route: '/passkey/register',
  driver_auth_enable: true,
  post_method: verifyAndSavePasskeyInDbController,
});

registerRoute({
  router,
  route: '/toggle',
  driver_auth_enable: true,
  post_method: toggle2FAStatusController,
});

registerRoute({
  router,
  route: '/device',
  driver_auth_enable: true,
  get_method: getUserDevicesController,
});

export default router;
