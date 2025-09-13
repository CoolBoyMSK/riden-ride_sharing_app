import {
  getAllDrivers,
  suspendDriver,
  unsuspendDriver,
  deleteDriverByIdAPI,
} from '../../../services/Admin/Drivers/index.js';
import { handleResponse } from '../../../utils/handleRespone.js';
import { validateDriverSuspension } from '../../../validations/driver.js';
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
      validationFn: validateDriverSuspension,
      handlerParams: [req.params.id],
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
