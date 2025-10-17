import express from 'express';
import { registerRoute } from '../../../../utils/registerRoute.js';
import {
  signUpPassengerController,
  loginUserController,
  otpVerificationController,
  sendPassengerPhoneOtpController,
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
  route: '/verify',
  post_method: otpVerificationController,
});

registerRoute({
  router,
  route: '/phone',
  post_method: sendPassengerPhoneOtpController,
});

export default router;
