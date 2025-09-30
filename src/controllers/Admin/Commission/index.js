import { handleResponse } from '../../../utils/handleRespone.js';
import {
  setCommission,
  getCommissions,
  getAdminCommissions,
  getCommissionStats,
} from '../../../services/Admin/Commission/index.js';

export const setCommissionController = async (req, res) =>
  handleResponse(
    {
      handler: setCommission,
      validationFn: null,
      handlerParams: [req.user, req.body],
      successMessage: 'Commission updated successfully',
    },
    req,
    res,
  );

export const getCommissionsController = async (req, res) =>
  handleResponse(
    {
      handler: getCommissions,
      validationFn: null,
      handlerParams: [req.user],
      successMessage: 'Commissions fetched successfully',
    },
    req,
    res,
  );

export const getAdminCommissionsController = async (req, res) =>
  handleResponse(
    {
      handler: getAdminCommissions,
      validationFn: null,
      handlerParams: [req.user, req.query],
      successMessage: 'Admin commissions fetched successfully',
    },
    req,
    res,
  );

export const getCommissionStatsController = async (req, res) =>
  handleResponse(
    {
      handler: getCommissionStats,
      validationFn: null,
      handlerParams: [req.user],
      successMessage: 'Commission stats fetched successfully',
    },
    req,
    res,
  );
