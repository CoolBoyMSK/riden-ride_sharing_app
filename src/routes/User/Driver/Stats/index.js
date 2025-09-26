import express from 'express';
import { registerRoute } from '../../../../utils/registerRoute.js';
import {
  getStatsController,
  getLifeTimeHighlightsController,
  getWeeklyStatsController,
  getDailyStatsForWeekController,
} from '../../../../controllers/User/Drivers/Stats/index.js';

const router = express.Router();

registerRoute({
  router,
  route: '/',
  driver_auth_enable: true,
  get_method: getStatsController,
});

registerRoute({
  router,
  route: '/lifetime',
  driver_auth_enable: true,
  get_method: getLifeTimeHighlightsController,
});

registerRoute({
  router,
  route: '/weekly',
  driver_auth_enable: true,
  get_method: getWeeklyStatsController,
});

registerRoute({
  router,
  route: '/daily',
  driver_auth_enable: true,
  get_method: getDailyStatsForWeekController,
});

export default router;
