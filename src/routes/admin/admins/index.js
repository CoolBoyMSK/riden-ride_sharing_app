import express from 'express';
import {
  addAdmin,
  fetchAdmins,
} from '../../../controllers/Admin/Admins/index.js';
import { registerRoute } from '../../../utils/registerRoute.js';

const router = express.Router();

registerRoute({
  router,
  route: '/admins',
  admin_auth_enable: true,
  get_permission: 'admin_roles',
  get_method: fetchAdmins,
});

registerRoute({
  router,
  route: '/admins',
  admin_auth_enable: true,
  post_permission: 'admin_roles',
  post_method: addAdmin,
});

export default router;
