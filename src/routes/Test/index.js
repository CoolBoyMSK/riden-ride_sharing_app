import express from 'express';
import stripeTestRouter from './stripeTestRoute.js';
import receiptEmailTestRouter from './receiptEmailTestRoute.js';
import driverEarningsTestRouter from './driverEarningsTestRoute.js';
import adminNotificationTestRouter from './adminNotificationTestRoute.js';

const router = express.Router();

router.use('/stripe', stripeTestRouter);
router.use('/receipt-email', receiptEmailTestRouter);
router.use('/admin-notification', adminNotificationTestRouter);
router.use('/', driverEarningsTestRouter);

export default router;
