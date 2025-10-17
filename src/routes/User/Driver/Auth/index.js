import express from 'express';
import { registerRoute } from '../../../../utils/registerRoute.js';
import {
  signUpPassengerController,
  loginUserController,
  otpVerificationController,
  sendPassengerPhoneOtpController,
  socialLoginUserController,
  forgotPasswordController,
  resetUserPasswordController,
  resendOtpController,
  refreshAuthTokenController,
  updateFCMTokenController,
} from '../../../../controllers/User/Passengers/Auth/index.js';

const router = express.Router();

registerRoute({
  router,
  route: '/signup',
  post_method: signUpPassengerController,
});

registerRoute({
  router,
  route: '/login',
  post_method: loginUserController,
});

registerRoute({
  router,
  route: '/social',
  post_method: socialLoginUserController,
});

registerRoute({
  router,
  route: '/verify',
  post_method: otpVerificationController,
});

registerRoute({
  router,
  route: '/phone',
  post_method: sendPassengerPhoneOtpController,
});

registerRoute({
  router,
  route: '/forgot',
  post_method: forgotPasswordController,
});

registerRoute({
  router,
  route: '/reset',
  post_method: resetUserPasswordController,
});

registerRoute({
  router,
  route: '/resend',
  post_method: resendOtpController,
});

registerRoute({
  router,
  route: '/refresh',
  post_method: refreshAuthTokenController,
});

registerRoute({
  router,
  route: '/fcm',
  passenger_auth_enable: true,
  put_method: updateFCMTokenController,
});

export default router;
