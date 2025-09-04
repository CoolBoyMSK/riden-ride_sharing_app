import express from 'express';
import authRouter from './Auth/index.js';
import userProfileRouter from './Profile/index.js';
import driverRouter from './Driver/index.js';
import rideRouter from './Ride/index.js';
import passengerRouter from './Passenger/index.js';

const userRouter = express.Router();

userRouter.use('/auth', authRouter);
userRouter.use('/profile', userProfileRouter);
userRouter.use('/driver', driverRouter);
userRouter.use('/rides', rideRouter);
userRouter.use('/passenger', passengerRouter);

export default userRouter;
