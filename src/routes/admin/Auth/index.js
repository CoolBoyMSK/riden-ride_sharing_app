import express from 'express';
import { registerRoute } from '../../../utils/registerRoute.js';
import { loginAdmin } from '../../../controllers/Admin/Auth/index.controller.js';

const router = express.Router();

registerRoute({
  router,
  route: '/login',
  post_method: loginAdmin,
});

export default router;
