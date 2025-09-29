import express from 'express';
import { registerRoute } from '../../../utils/registerRoute.js';
import {
  getActiveDriversCountController,
  getOngoingRideInfoController,
} from '../../../controllers/Admin/Dashboard/index.js';

const router = express.Router();

registerRoute({
  router,
  route: '/active-drivers',
  admin_auth_enable: true,
  get_permission: 'dashboard',
  get_method: getActiveDriversCountController,
});

registerRoute({
  router,
  route: '/ongoing/:id',
  admin_auth_enable: true,
  get_permission: 'dashboard',
  get_method: getOngoingRideInfoController,
});

export default router;
