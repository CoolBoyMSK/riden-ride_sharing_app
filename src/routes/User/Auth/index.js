import express from 'express';
import { registerRoute } from '../../../utils/registerRoute.js';
import {
  signupController,
  resetPasswordController,
  loginController,
  refreshController,
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

registerRoute({
  router,
  route: '/login',
  post_method: loginController,
});

registerRoute({
  router,
  route: '/refresh',
  post_method: refreshController,
});

export default router;
