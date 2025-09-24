import express from 'express';
import { registerRoute } from '../../../../utils/registerRoute.js';
import {
  getAllBookingsController,
  getBookingByIdController,
  addBookingReportController,
} from '../../../../controllers/User/Drivers/booking/index.js';

const router = express.Router();

registerRoute({
  router,
  route: '/',
  driver_auth_enable: true,
  get_method: getAllBookingsController,
});

registerRoute({
  router,
  route: '/get',
  driver_auth_enable: true,
  get_method: getBookingByIdController,
});

registerRoute({
  router,
  route: '/report',
  driver_auth_enable: true,
  post_method: addBookingReportController,
});

export default router;
