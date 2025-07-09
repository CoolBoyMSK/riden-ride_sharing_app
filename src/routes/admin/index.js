import express from 'express';
import authRouter from './Auth/index.js';
import adminsRouter from './admins/index.js';
import promoCodeRouter from './promo_codes/index.js';
import passengersRouter from './Passengers/index.js';
import driverRouter from './Drivers/index.js';
import fareRouter from './FareManagement/index.js';

const adminRouter = express.Router();

adminRouter.use('/auth', authRouter);
adminRouter.use('/manage', adminsRouter);
adminRouter.use('/promo-code', promoCodeRouter);
adminRouter.use('/passengers', passengersRouter);
adminRouter.use('/drivers', driverRouter);
adminRouter.use('/fare-management', fareRouter);

export default adminRouter;
