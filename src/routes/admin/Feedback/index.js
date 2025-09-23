import express from 'express';
import { registerRoute } from '../../../utils/registerRoute.js';
import {
  getDriverFeedbacksController,
  deleteFeedbackController,
  feedbackStatsController,
} from '../../../controllers/Admin/Feedback/index.js';

const router = express.Router();

registerRoute({
  router,
  route: '/',
  admin_auth_enable: true,
  get_method: getDriverFeedbacksController,
});

registerRoute({
  router,
  route: '/delete',
  admin_auth_enable: true,
  delete_method: deleteFeedbackController,
});

registerRoute({
  router,
  route: '/stats',
  admin_auth_enable: true,
  get_method: feedbackStatsController,
});

export default router;
