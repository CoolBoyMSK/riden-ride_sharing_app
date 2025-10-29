import express from 'express';
import { registerRoute } from '../../../utils/registerRoute.js';
import {
  getCompletedBookingsController,
  getOngoingBookingsController,
  getBookingByIdController,
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
  route: '/:id',
  admin_auth_enable: true,
  get_permission: 'booking_management',
  get_method: getBookingByIdController,
});

export default router;
