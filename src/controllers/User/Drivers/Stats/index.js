import { handleResponse } from '../../../../utils/handleRespone.js';
import {
  getStats,
  getLifeTimeHighlights,
  getWeeklyStats,
  getDailyStatsForWeek,
} from '../../../../services/User/driver/Stats/index.js';

export const getStatsController = (req, res) =>
  handleResponse(
    {
      handler: getStats,
      validationFn: null,
      handlerParams: [req.user, req.query],
      successMessage: 'Stats fetched successfully',
    },
    req,
    res,
  );

export const getLifeTimeHighlightsController = (req, res) =>
  handleResponse(
    {
      handler: getLifeTimeHighlights,
      validationFn: null,
      handlerParams: [req.user],
      successMessage: 'Stats fetched successfully',
    },
    req,
    res,
  );

export const getWeeklyStatsController = (req, res) =>
  handleResponse(
    {
      handler: getWeeklyStats,
      validationFn: null,
      handlerParams: [req.user],
      successMessage: 'Stats fetched successfully',
    },
    req,
    res,
  );

export const getDailyStatsForWeekController = (req, res) =>
  handleResponse(
    {
      handler: getDailyStatsForWeek,
      validationFn: null,
      handlerParams: [req.user, req.query],
      successMessage: 'Stats fetched successfully',
    },
    req,
    res,
  );
