import express from 'express';
import { uploadSingle } from '../../middlewares/upload.js';
import { fetchProfile, editProfile } from '../../controllers/User/profile.js';
import { registerRoute } from '../../utils/registerRoute.js';
import { authenticateUser } from '../../middlewares/genericAuth.js';

const router = express.Router();

registerRoute({
  router,
  route: '/me',
  get_middlewares: [authenticateUser],
  get_method: fetchProfile,
});

registerRoute({
  router,
  route: '/update',
  put_middlewares: [authenticateUser, uploadSingle],
  put_method: editProfile,
});

export default router;
