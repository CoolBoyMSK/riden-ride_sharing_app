import express from 'express';
import { registerRoute } from '../../../utils/registerRoute.js';
import {
  getDriverFeedbacksController,
  deleteFeedbackController,
  feedbackStatsController,
  getRequestedFeedbacksController,
  toggleFeedbackRequestController,
} from '../../../controllers/Admin/Feedback/index.js';

const router = express.Router();

registerRoute({
  router,
  route: '/',
  admin_auth_enable: true,
  get_permission: 'reviews_ratings',
  get_method: getDriverFeedbacksController,
});

registerRoute({
  router,
  route: '/delete',
  admin_auth_enable: true,
  delete_permission: 'reviews_ratings',
  delete_method: deleteFeedbackController,
});

registerRoute({
  router,
  route: '/stats',
  admin_auth_enable: true,
  get_permission: 'reviews_ratings',
  get_method: feedbackStatsController,
});

registerRoute({
  router,
  route: '/requested',
  admin_auth_enable: true,
  get_permission: 'reviews_ratings',
  get_method: getRequestedFeedbacksController,
});

registerRoute({
  router,
  route: '/toggle/:id',
  admin_auth_enable: true,
  put_permission: 'reviews_ratings',
  put_method: toggleFeedbackRequestController,
});

export default router;
