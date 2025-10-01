import express from 'express';
import authRouter from './Auth/index.js';
import userProfileRouter from './Profile/index.js';
import driverRouter from './Driver/index.js';
import rideRouter from './Ride/index.js';
import passengerRouter from './Passenger/index.js';
import supportRouter from './support/index.js';
import callRouter from './Call/index.js';
import notificationRouter from './Notification/index.js';
import securityRouter from './Security/index.js';
import cmsRouter from './CMS/index.js';

const userRouter = express.Router();

userRouter.use('/auth', authRouter);
userRouter.use('/profile', userProfileRouter);
userRouter.use('/driver', driverRouter);
userRouter.use('/rides', rideRouter);
userRouter.use('/passenger', passengerRouter);
userRouter.use('/support', supportRouter);
userRouter.use('/call', callRouter);
userRouter.use('/notification', notificationRouter);
userRouter.use('/security', securityRouter);
userRouter.use('/cms', cmsRouter);

export default userRouter;
