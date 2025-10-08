import express from 'express';
import { registerRoute } from '../../../utils/registerRoute.js';
import {
  getUpcomingPayoutsController,
  getPreviousPayoutsController,
  getInstantPayoutRequestsController,
  editInstantPayoutRequestController,
  getInstantPayoutRequestsCountController,
  refundPassengerController,
} from '../../../controllers/Admin/Payout/index.js';

const router = express.Router();

registerRoute({
  router,
  route: '/upcoming',
  admin_auth_enable: true,
  get_method: getUpcomingPayoutsController,
});

registerRoute({
  router,
  route: '/previous',
  admin_auth_enable: true,
  get_method: getPreviousPayoutsController,
});

registerRoute({
  router,
  route: '/requests',
  admin_auth_enable: true,
  get_method: getInstantPayoutRequestsController,
});

registerRoute({
  router,
  route: '/edit',
  admin_auth_enable: true,
  put_method: editInstantPayoutRequestController,
});

registerRoute({
  router,
  route: '/count',
  admin_auth_enable: true,
  get_method: getInstantPayoutRequestsCountController,
});

registerRoute({
  router,
  route: '/refund',
  admin_auth_enable: true,
  put_method: refundPassengerController,
});

export default router;
