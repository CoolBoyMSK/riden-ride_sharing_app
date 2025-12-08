import express from 'express';
import stripeTestRouter from './stripeTestRoute.js';
import receiptEmailTestRouter from './receiptEmailTestRoute.js';
import driverEarningsTestRouter from './driverEarningsTestRoute.js';

const router = express.Router();

router.use('/stripe', stripeTestRouter);
router.use('/receipt-email', receiptEmailTestRouter);
router.use('/', driverEarningsTestRouter);

export default router;
