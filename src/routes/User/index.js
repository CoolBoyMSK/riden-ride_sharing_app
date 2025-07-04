import express from 'express';
import authRouter from './Auth/index.js';
import userProfileRouter from './profile.js';

const userRouter = express.Router();

userRouter.use('/auth', authRouter);
userRouter.use('/profile', userProfileRouter);

export default userRouter;
