import { handleResponse } from '../../../utils/handleRespone.js';
import {
  findAllComplainTickets,
  getComplainById,
  updateComplainStatus,
  replyToComplain,
  findAllReports,
  getReportById,
  updateReportStatus,
} from '../../../services/Admin/Support/index.js';

export const findAllComplainTicketsController = (req, res) =>
  handleResponse(
    {
      handler: findAllComplainTickets,
      validationFn: null,
      handlerParams: [req.user, req.query],
      successMessage: 'Complain tickets fetched successfully',
    },
    req,
    res,
  );

export const getComplainByIdController = (req, res) =>
  handleResponse(
    {
      handler: getComplainById,
      validationFn: null,
      handlerParams: [req.user, req.query],
      successMessage: 'Complain ticket fetched successfully',
    },
    req,
    res,
  );

export const updateComplainStatusController = (req, res) =>
  handleResponse(
    {
      handler: updateComplainStatus,
      validationFn: null,
      handlerParams: [req.user, req.query],
      successMessage: 'Complain ticket updated successfully',
    },
    req,
    res,
  );

export const replyToComplainController = (req, res) =>
  handleResponse(
    {
      handler: replyToComplain,
      validationFn: null,
      handlerParams: [req.user, req.query, req.body, req.files],
      successMessage: 'Complain replied successfully',
    },
    req,
    res,
  );

export const findAllReportsController = (req, res) =>
  handleResponse(
    {
      handler: findAllReports,
      validationFn: null,
      handlerParams: [req.user, req.query],
      successMessage: 'Reports fetched successfully',
    },
    req,
    res,
  );

export const getReportByIdController = (req, res) =>
  handleResponse(
    {
      handler: getReportById,
      validationFn: null,
      handlerParams: [req.user, req.query],
      successMessage: 'Report fetched successfully',
    },
    req,
    res,
  );

export const updateReportStatusController = (req, res) =>
  handleResponse(
    {
      handler: updateReportStatus,
      validationFn: null,
      handlerParams: [req.user, req.query],
      successMessage: 'Report status updated successfully',
    },
    req,
    res,
  );
