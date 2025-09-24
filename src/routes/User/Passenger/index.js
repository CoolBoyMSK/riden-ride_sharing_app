import express from 'express';
import addressManagementRouter from './addressManagementRoute.js';
import paymentManagementRouter from './paymentManagementRoute.js';
import bookingRouter from './booking/index.js';

const passengerRouter = express.Router();

passengerRouter.use('/address', addressManagementRouter);
passengerRouter.use('/payment-method', paymentManagementRouter);
passengerRouter.use('/booking-management', bookingRouter);

export default passengerRouter;
