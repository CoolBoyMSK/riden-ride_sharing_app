import express from 'express';
import documentsRouter from './documents/index.js';
import vehicleRouter from './vehicleManagment/index.js';
import destinationRouter from './destination/index.js';
import paymentRouter from './payment/index.js';

const driverRouter = express.Router();

driverRouter.use('/documents', documentsRouter);
driverRouter.use('/vehicle-management', vehicleRouter);
driverRouter.use('/destination-management', destinationRouter);
driverRouter.use('/payment-management', paymentRouter);

export default driverRouter;
