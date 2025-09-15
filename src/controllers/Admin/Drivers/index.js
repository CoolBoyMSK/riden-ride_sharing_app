import {
  getAllDrivers,
  suspendDriver,
  unsuspendDriver,
  deleteDriverByIdAPI,
  findDriverById,
  updateDriverDocumentStatus,
} from '../../../services/Admin/Drivers/index.js';
import { handleResponse } from '../../../utils/handleRespone.js';
import {
  validateDriverSuspension,
  validateDocUpdate,
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
      // validationFn: validateDriverSuspension(req.body),
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
