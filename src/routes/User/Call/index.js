import express from 'express';
import { registerRoute } from '../../../utils/registerRoute.js';
import { getAgoraTokenController } from '../../../controllers/User/Call/index.js';
import { anyUserAuth } from '../../../middlewares/anyUserAuth.js';

const router = express.Router();

registerRoute({
  router,
  route: '/',
  get_middlewares: [anyUserAuth],
  get_method: getAgoraTokenController,
});

export default router;
