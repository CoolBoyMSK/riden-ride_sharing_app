import express from 'express';
import { uploadSingle } from '../../../middlewares/upload.js';
import {
  fetchProfile,
  editPassengerProfile,
  editDriverProfile,
  sendEmailUpdateOtpController,
  verifyEmailUpdateController,
  sendPhoneUpdateOtpController,
  verifyPhoneUpdateController,
  verifyBothEmailAndPhoneUpdateController,
} from '../../../controllers/User/profile.js';
import { registerRoute } from '../../../utils/registerRoute.js';
import { anyUserAuth } from '../../../middlewares/anyUserAuth.js';

const router = express.Router();

registerRoute({
  router,
  route: '/me',
  get_middlewares: [anyUserAuth],
  get_method: fetchProfile,
});

registerRoute({
  router,
  route: '/passenger/update',
  passenger_auth_enable: true,
  put_middlewares: [uploadSingle],
  put_method: editPassengerProfile,
});

registerRoute({
  router,
  route: '/driver/update',
  driver_auth_enable: true,
  put_middlewares: [uploadSingle],
  put_method: editDriverProfile,
});

registerRoute({
  router,
  route: '/email',
  post_middlewares: [anyUserAuth],
  post_method: sendEmailUpdateOtpController,
});

registerRoute({
  router,
  route: '/verify-email',
  put_middlewares: [anyUserAuth],
  put_method: verifyEmailUpdateController,
});

registerRoute({
  router,
  route: '/phone',
  post_middlewares: [anyUserAuth],
  post_method: sendPhoneUpdateOtpController,
});

registerRoute({
  router,
  route: '/verify-phone',
  put_middlewares: [anyUserAuth],
  put_method: verifyPhoneUpdateController,
});

registerRoute({
  router,
  route: '/verify-both',
  put_middlewares: [anyUserAuth],
  put_method: verifyBothEmailAndPhoneUpdateController,
});

export default router;
