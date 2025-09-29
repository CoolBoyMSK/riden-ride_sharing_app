import express from 'express';
import { registerRoute } from '../../../utils/registerRoute.js';
import {
  getGenericAnalyticsController,
  getDriversAnalyticsController,
  getPassengersAnalyticsController,
  getRidesAnalyticsController,
  getFinancialAnalyticsController,
} from '../../../controllers/Admin/Analytics/index.js';

const router = express.Router();

registerRoute({
  router,
  route: '/',
  admin_auth_enable: true,
  get_permission: 'analytics',
  get_method: getGenericAnalyticsController,
});

registerRoute({
  router,
  route: '/drivers',
  admin_auth_enable: true,
  get_permission: 'analytics',
  get_method: getDriversAnalyticsController,
});

registerRoute({
  router,
  route: '/passengers',
  admin_auth_enable: true,
  get_permission: 'analytics',
  get_method: getPassengersAnalyticsController,
});

registerRoute({
  router,
  route: '/rides',
  admin_auth_enable: true,
  get_permission: 'analytics',
  get_method: getRidesAnalyticsController,
});

registerRoute({
  router,
  route: '/financial',
  admin_auth_enable: true,
  get_permission: 'analytics',
  get_method: getFinancialAnalyticsController,
});

export default router;
