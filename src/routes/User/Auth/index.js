import express from 'express';
import { registerRoute } from '../../../utils/registerRoute.js';
import {
  signupController,
  resetPasswordController,
  loginController,
  refreshController,
  otpVerificationController,
  forgotPasswordController,
  passKeyLogInAuthOptionsController,
  verifyPasskeyLoginAuthController,
  updateFCMTokenController,
} from '../../../controllers/User/authIndex.js';
import { verifyFirebaseToken } from '../../../middlewares/firebaseAuth.js';
import { driverAuthenticate } from '../../../middlewares/driverAuth.js';
import { anyUserAuth } from '../../../middlewares/anyUserAuth.js';

const router = express.Router();

registerRoute({
  router,
  route: '/signup',
  put_middlewares: [driverAuthenticate],
  put_method: signupController,
  post_method: signupController,
});

registerRoute({
  router,
  route: '/login',
  post_method: loginController,
});

registerRoute({
  router,
  route: '/reset-password',
  post_method: resetPasswordController,
});

registerRoute({
  router,
  route: '/verify-otp',
  post_method: otpVerificationController,
});

registerRoute({
  router,
  route: '/forgot-password',
  post_method: forgotPasswordController,
});

registerRoute({
  router,
  route: '/refresh',
  post_method: refreshController,
});

registerRoute({
  router,
  route: '/passkey/login-options',
  post_method: passKeyLogInAuthOptionsController,
});

registerRoute({
  router,
  route: '/passkey/login',
  post_method: verifyPasskeyLoginAuthController,
});

registerRoute({
  router,
  route: '/fcm',
  put_middlewares: [anyUserAuth],
  put_method: updateFCMTokenController,
});

export default router;
