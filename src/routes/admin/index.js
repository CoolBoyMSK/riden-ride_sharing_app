import express from 'express';
import authRouter from './Auth/index.js';
import adminsRouter from './admins/index.js';
import promoCodeRouter from './promo_codes/index.js';

const adminRouter = express.Router();

adminRouter.use('/auth', authRouter);
adminRouter.use('/manage', adminsRouter);
adminRouter.use('/promo-code', promoCodeRouter);

export default adminRouter;
