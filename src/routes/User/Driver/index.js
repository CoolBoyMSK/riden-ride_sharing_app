import express from 'express';
import documentsRouter from './documents/index.js';
import vehicleRouter from './vehicleManagment/index.js';
import destinationRouter from './destination/index.js';

const driverRouter = express.Router();

driverRouter.use('/documents', documentsRouter);
driverRouter.use('/vehicle-management', vehicleRouter);
driverRouter.use('/destination-management', destinationRouter);

export default driverRouter;
