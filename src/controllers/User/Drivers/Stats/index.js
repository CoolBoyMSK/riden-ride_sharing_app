import { handleResponse } from '../../../../utils/handleRespone.js';
import {
  getStats,
  getLifeTimeHighlights,
  getWeeklyStats,
  getDailyStatsForWeek,
  getDrivingHours,
  fetchDriverBalance,
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

export const getDrivingHoursController = (req, res) =>
  handleResponse(
    {
      handler: getDrivingHours,
      validationFn: null,
      handlerParams: [req.user],
      successMessage: 'Driving hours fetched successfully',
    },
    req,
    res,
  );

export const fetchDriverBalanceController = (req, res) =>
  handleResponse(
    {
      handler: fetchDriverBalance,
      validationFn: null,
      handlerParams: [req.user],
      successMessage: 'Driving balance fetched successfully',
    },
    req,
    res,
  );
