import express from 'express';
import addressManagementRouter from './addressManagementRoute.js';

const passengerRouter = express.Router();

passengerRouter.use('/address', addressManagementRouter);

export default passengerRouter;
