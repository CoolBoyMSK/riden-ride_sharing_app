import express from 'express';
import { registerRoute } from '../../../../utils/registerRoute.js';
import {
  getAllBookingsController,
  getScheduledBookingsController,
  getBookingByIdController,
  addBookingReportController,
  rateBookingController,
  downloadReceiptController,
  generateReceiptController,
} from '../../../../controllers/User/Passengers/booking/index.js';

const router = express.Router();

registerRoute({
  router,
  route: '/',
  passenger_auth_enable: true,
  get_method: getAllBookingsController,
});

registerRoute({
  router,
  route: '/scheduled',
  passenger_auth_enable: true,
  get_method: getScheduledBookingsController,
});

registerRoute({
  router,
  route: '/get',
  passenger_auth_enable: true,
  get_method: getBookingByIdController,
});

registerRoute({
  router,
  route: '/report',
  passenger_auth_enable: true,
  post_method: addBookingReportController,
});

registerRoute({
  router,
  route: '/rate',
  passenger_auth_enable: true,
  post_method: rateBookingController,
});

registerRoute({
  router,
  route: '/generate',
  passenger_auth_enable: true,
  post_method: generateReceiptController,
});

registerRoute({
  router,
  route: '/download',
  passenger_auth_enable: true,
  get_method: downloadReceiptController,
});

export default router;
