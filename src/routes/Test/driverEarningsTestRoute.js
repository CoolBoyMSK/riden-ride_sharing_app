import express from 'express';
import { getDriverEarningsByEmailController } from '../../controllers/Test/driverEarnings.js';

const router = express.Router();

// GET /api/test/driver-earnings?email=driver@example.com
router.get('/driver-earnings', getDriverEarningsByEmailController);

export default router;

