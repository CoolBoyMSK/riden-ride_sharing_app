import {
  getAllDrivers,
  suspendDriver,
  unsuspendDriver,
  deleteDriverByIdAPI,
  findDriverById,
  updateDriverDocumentStatus,
  blockDriver,
  unblockDriver,
  getAllUpdateRequests,
  toggleUpdateRequest,
  approveRequestedDriver,
  uploadWayBillDocument,
  getWayBillDocument,
} from '../../../services/Admin/Drivers/index.js';
import { handleResponse } from '../../../utils/handleRespone.js';
import {
  validateDriverSuspension,
  validateDocUpdate,
  validateToggleUpdateRequest,
} from '../../../validations/driver.js';
import { validatePagination } from '../../../validations/pagination.js';

export const fetchAllDrivers = (req, res) =>
  handleResponse(
    {
      handler: getAllDrivers,
      validationFn: () =>
        validatePagination({ page: req.query.page, limit: req.query.limit }),
      handlerParams: [req.query],
      successMessage: 'Drivers fetched successfully',
    },
    req,
    res,
  );

export const suspendDriverController = (req, res) =>
  handleResponse(
    {
      handler: suspendDriver,
      validationFn: () => validateDriverSuspension(req.body),
      handlerParams: [req.params.id, req.body],
      successMessage: 'Driver suspended',
    },
    req,
    res,
  );

export const unsuspendDriverController = (req, res) =>
  handleResponse(
    {
      handler: unsuspendDriver,
      handlerParams: [req.params.id],
      successMessage: 'Driver unsuspended',
    },
    req,
    res,
  );

export const deleteDriverByIdAPIController = (req, res) =>
  handleResponse(
    {
      handler: deleteDriverByIdAPI,
      handlerParams: [req.params],
      successMessage: 'Driver deleted successfully',
    },
    req,
    res,
  );

export const findDriverByIdController = (req, res) =>
  handleResponse(
    {
      handler: findDriverById,
      handlerParams: [req.params],
      successMessage: 'Driver fetched successfully',
    },
    req,
    res,
  );

export const updateDriverDocumentStatusController = (req, res) =>
  handleResponse(
    {
      handler: updateDriverDocumentStatus,
      validationFn: () =>
        validateDocUpdate({
          docType: req.query.docType,
          status: req.query.status,
        }),
      handlerParams: [req.query],
      successMessage: 'Document status updated successfully',
    },
    req,
    res,
  );

export const blockDriverController = (req, res) =>
  handleResponse(
    {
      handler: blockDriver,
      handlerParams: [req.params],
      successMessage: 'Driver Blocked successfully',
    },
    req,
    res,
  );

export const unblockDriverController = (req, res) =>
  handleResponse(
    {
      handler: unblockDriver,
      handlerParams: [req.params],
      successMessage: 'Driver Unblocked successfully',
    },
    req,
    res,
  );

export const getAllUpdateRequestsController = (req, res) =>
  handleResponse(
    {
      handler: getAllUpdateRequests,
      validationFn: () =>
        validatePagination({ page: req.query.page, limit: req.query.limit }),
      handlerParams: [req.query],
      successMessage: 'Update requests detched successfully',
    },
    req,
    res,
  );

export const toggleUpdateRequestController = (req, res) =>
  handleResponse(
    {
      handler: toggleUpdateRequest,
      validationFn: () => validateToggleUpdateRequest(req.query),
      handlerParams: [req.query],
      successMessage: 'Driver request updated successfully',
    },
    req,
    res,
  );

export const approveRequestedDriverController = (req, res) =>
  handleResponse(
    {
      handler: approveRequestedDriver,
      handlerParams: [req.params],
      successMessage: 'Driver approved successfully',
    },
    req,
    res,
  );

export const uploadWayBillDocumentController = (req, res) =>
  handleResponse(
    {
      handler: uploadWayBillDocument,
      handlerParams: [req.query, req.body, req.file],
      successMessage: 'Way Bill issued successfully',
    },
    req,
    res,
  );

export const getWayBillDocumentController = (req, res) =>
  handleResponse(
    {
      handler: getWayBillDocument,
      handlerParams: [req.query],
      successMessage: 'Way Bill fetched successfully',
    },
    req,
    res,
  );
