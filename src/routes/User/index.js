import express from 'express';
import authRouter from './Auth/index.js';

const userRouter = express.Router();

userRouter.use('/auth', authRouter);

export default userRouter;
