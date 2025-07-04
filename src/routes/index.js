import express from 'express';
import adminRouter from './admin/index.js';
import userRouter from './User/index.js';

const router = express.Router();

router.use('/admin', adminRouter);
router.use('/user', userRouter);

export default router;
