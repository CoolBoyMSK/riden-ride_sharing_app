import { handleResponse } from '../../../utils/handleRespone.js';
import {
  sendAlert,
  getAllPassengers,
  getAllDrivers,
  getAllAlerts,
  deleteAlert,
} from '../../../services/Admin/Alert/index.js';

export const sendAlertController = (req, res) =>
  handleResponse(
    {
      handler: sendAlert,
      validationFn: null,
      handlerParams: [req.user, req.body],
      successMessage: 'Alert sent successfully',
    },
    req,
    res,
  );

export const getAllPassengersController = (req, res) =>
  handleResponse(
    {
      handler: getAllPassengers,
      validationFn: null,
      handlerParams: [],
      successMessage: 'Passengers fetched successfully',
    },
    req,
    res,
  );

export const getAllDriversController = (req, res) =>
  handleResponse(
    {
      handler: getAllDrivers,
      validationFn: null,
      handlerParams: [],
      successMessage: 'Drivers fetched successfully',
    },
    req,
    res,
  );

export const getAllAlertsController = (req, res) =>
  handleResponse(
    {
      handler: getAllAlerts,
      validationFn: null,
      handlerParams: [req.query],
      successMessage: 'Alerts fetched successfully',
    },
    req,
    res,
  );

export const deleteAlertController = (req, res) =>
  handleResponse(
    {
      handler: deleteAlert,
      validationFn: null,
      handlerParams: [req.user, req.params],
      successMessage: 'Alert deleted successfully',
    },
    req,
    res,
  );
