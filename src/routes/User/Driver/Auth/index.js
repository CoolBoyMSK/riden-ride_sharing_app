import express from 'express';
import { registerRoute } from '../../../../utils/registerRoute.js';
import {
  signUpDriverWithEmailController,
  signUpDriverWithPhoneController,
  loginUserController,
  otpVerificationController,
  sendDriverPhoneOtpController,
  sendDriverEmailOtpController,
  socialLoginUserController,
  forgotPasswordController,
  resetUserPasswordController,
  resendOtpController,
  refreshAuthTokenController,
  updateFCMTokenController,
} from '../../../../controllers/User/Drivers/Auth/index.js';

const router = express.Router();

registerRoute({
  router,
  route: '/email-signup',
  post_method: signUpDriverWithEmailController,
});

registerRoute({
  router,
  route: '/phone-signup',
  post_method: signUpDriverWithPhoneController,
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
  post_method: sendDriverPhoneOtpController,
});

registerRoute({
  router,
  route: '/email',
  post_method: sendDriverEmailOtpController,
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
  driver_auth_enable: true,
  put_method: updateFCMTokenController,
});

export default router;
