import { handleResponse } from '../../../utils/handleRespone.js';
import {
  getGenericAnalytics,
  getDriversAnalytics,
  getPassengersAnalytics,
  getRidesAnalytics,
  getFinancialAnalytics,
} from '../../../services/Admin/Analytics/index.js';

export const getGenericAnalyticsController = (req, res) =>
  handleResponse(
    {
      handler: getGenericAnalytics,
      validationFn: null,
      handlerParams: [req.user, req.query],
      successMessage: 'Generic analytics fetched successfully',
    },
    req,
    res,
  );

export const getDriversAnalyticsController = (req, res) =>
  handleResponse(
    {
      handler: getDriversAnalytics,
      validationFn: null,
      handlerParams: [req.user, req.query],
      successMessage: 'Drivers analytics fetched successfully',
    },
    req,
    res,
  );

export const getPassengersAnalyticsController = (req, res) =>
  handleResponse(
    {
      handler: getPassengersAnalytics,
      validationFn: null,
      handlerParams: [req.user, req.query],
      successMessage: 'Passengers analytics fetched successfully',
    },
    req,
    res,
  );

export const getRidesAnalyticsController = (req, res) =>
  handleResponse(
    {
      handler: getRidesAnalytics,
      validationFn: null,
      handlerParams: [req.user, req.query],
      successMessage: 'Rides analytics fetched successfully',
    },
    req,
    res,
  );

export const getFinancialAnalyticsController = (req, res) =>
  handleResponse(
    {
      handler: getFinancialAnalytics,
      validationFn: null,
      handlerParams: [req.user, req.query],
      successMessage: 'Financial analytics fetched successfully',
    },
    req,
    res,
  );
