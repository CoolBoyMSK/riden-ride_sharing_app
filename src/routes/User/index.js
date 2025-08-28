import express from 'express';
import authRouter from './Auth/index.js';
import userProfileRouter from './Profile/index.js';
import driverRouter from './Driver/index.js';

const userRouter = express.Router();

userRouter.use('/auth', authRouter);
userRouter.use('/profile', userProfileRouter);
userRouter.use('/driver', driverRouter);

export default userRouter;
