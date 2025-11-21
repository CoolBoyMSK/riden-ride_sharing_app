import express from 'express';
import adminRouter from './admin/index.js';
import userRouter from './User/index.js';
import testRouter from './Test/index.js';

const router = express.Router();

router.use('/admin', adminRouter);
router.use('/user', userRouter);
router.use('/test', testRouter);

export default router;
