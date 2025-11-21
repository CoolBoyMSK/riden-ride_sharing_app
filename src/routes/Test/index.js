import express from 'express';
import stripeTestRouter from './stripeTestRoute.js';

const router = express.Router();

router.use('/stripe', stripeTestRouter);

export default router;
