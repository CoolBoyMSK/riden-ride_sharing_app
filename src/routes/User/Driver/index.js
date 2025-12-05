import express from 'express';
import authRouter from './Auth/index.js';
import documentsRouter from './documents/index.js';
import vehicleRouter from './vehicleManagment/index.js';
import destinationRouter from './destination/index.js';
import destinationRideRouter from './destinationRide/index.js';
import paymentRouter from './payment/index.js';
import bookingRouter from './booking/index.js';
import statsRouter from './Stats/index.js';

const driverRouter = express.Router();

driverRouter.use('/auth', authRouter);
driverRouter.use('/documents', documentsRouter);
driverRouter.use('/vehicle-management', vehicleRouter);
driverRouter.use('/destination-management', destinationRouter);
driverRouter.use('/destination-ride', destinationRideRouter);
driverRouter.use('/payment-management', paymentRouter);
driverRouter.use('/booking-management', bookingRouter);
driverRouter.use('/statistic', statsRouter);

export default driverRouter;
