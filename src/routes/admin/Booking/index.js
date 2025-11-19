import express from 'express';
import { registerRoute } from '../../../utils/registerRoute.js';
import {
  getCompletedBookingsController,
  getOngoingBookingsController,
  getScheduledBookingsController,
  getBookingByIdController,
  getNearestDriversForScheduledRideController,
  assignDriverToScheduledRideController,
} from '../../../controllers/Admin/Booking/index.js';

const router = express.Router();

registerRoute({
  router,
  route: '/completed',
  admin_auth_enable: true,
  get_permission: 'booking_management',
  get_method: getCompletedBookingsController,
});

registerRoute({
  router,
  route: '/ongoing',
  admin_auth_enable: true,
  get_permission: 'booking_management',
  get_method: getOngoingBookingsController,
});

registerRoute({
  router,
  route: '/scheduled',
  admin_auth_enable: true,
  get_permission: 'booking_management',
  get_method: getScheduledBookingsController,
});

registerRoute({
  router,
  route: '/:id',
  admin_auth_enable: true,
  get_permission: 'booking_management',
  get_method: getBookingByIdController,
});

registerRoute({
  router,
  route: '/drivers/:id',
  admin_auth_enable: true,
  get_permission: 'booking_management',
  get_method: getNearestDriversForScheduledRideController,
});

registerRoute({
  router,
  route: '/assign/:id',
  admin_auth_enable: true,
  post_permission: 'booking_management',
  post_method: assignDriverToScheduledRideController,
});

export default router;
