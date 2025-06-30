import express from 'express';
import authRouter from './Auth/index.js';
import adminsRouter from './admins/index.js';

const adminRouter = express.Router();

adminRouter.use('/auth', authRouter);
adminRouter.use('/manage', adminsRouter);

export default adminRouter;
