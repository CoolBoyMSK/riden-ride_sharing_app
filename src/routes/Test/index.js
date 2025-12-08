import express from 'express';
import stripeTestRouter from './stripeTestRoute.js';
import receiptEmailTestRouter from './receiptEmailTestRoute.js';

const router = express.Router();

router.use('/stripe', stripeTestRouter);
router.use('/receipt-email', receiptEmailTestRouter);

export default router;
