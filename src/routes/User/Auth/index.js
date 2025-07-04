import express from 'express';
import { registerRoute } from '../../../utils/registerRoute.js';
import {
  signupController,
  resetPasswordController,
} from '../../../controllers/User/authIndex.js';
import { verifyFirebaseToken } from '../../../middlewares/firebaseAuth.js';

const router = express.Router();

registerRoute({
  router,
  route: '/signup',
  post_method: signupController,
});

registerRoute({
  router,
  route: '/reset-password',
  post_middlewares: [verifyFirebaseToken],
  post_method: resetPasswordController,
});

export default router;
