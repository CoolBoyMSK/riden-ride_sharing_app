import express from 'express';
import addressManagementRouter from './addressManagementRoute.js';
import paymentManagementRouter from './paymentManagementRoute.js';

const passengerRouter = express.Router();

passengerRouter.use('/address', addressManagementRouter);
passengerRouter.use('/payment-method', paymentManagementRouter);

export default passengerRouter;
