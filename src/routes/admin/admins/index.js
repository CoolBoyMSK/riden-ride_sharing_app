import express from 'express';
import {
  addAdmin,
  fetchAdmins,
  updateAdminController,
} from '../../../controllers/Admin/Admins/index.js';
import { registerRoute } from '../../../utils/registerRoute.js';

const router = express.Router();

registerRoute({
  router,
  route: '/admins',
  admin_auth_enable: true,
  get_permission: 'admin_roles',
  get_method: fetchAdmins,
  post_permission: 'admin_roles',
  post_super_enable: true,
  post_method: addAdmin,
});

registerRoute({
  router,
  route: '/admins/:id',
  admin_auth_enable: true,
  put_permission: 'admin_roles',
  put_super_enable: true,
  put_method: updateAdminController,
});

export default router;
