import express from 'express';
import { registerRoute } from '../../../utils/registerRoute.js';
import {
  signupController,
  resetPasswordController,
  loginController,
  refreshController,
  otpVerificationController,
  forgotPasswordController,
} from '../../../controllers/User/authIndex.js';
import { verifyFirebaseToken } from '../../../middlewares/firebaseAuth.js';
import { anyUserAuth } from '../../../middlewares/anyUserAuth.js';

const router = express.Router();

registerRoute({
  router,
  route: '/signup',
  post_middlewares: [anyUserAuth],
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

export default router;
