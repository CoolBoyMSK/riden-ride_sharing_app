import {
  addFare,
  getAllFares,
  updateFare,
  deleteFare,
} from '../../../services/Admin/fareManagement/index.js';
import {
  createFareManagementValidation,
  updateFareManagementValidation,
} from '../../../validations/admin/fareManagement.js';
import { handleResponse } from '../../../utils/handleRespone.js';

export function addFareController(req, res) {
  return handleResponse(
    {
      handler: addFare,
      validationFn: null,
      handlerParams: [req.body],
      successMessage: 'Fare added successfully',
    },
    req,
    res,
  );
}

export function getAllFaresController(req, res) {
  return handleResponse(
    {
      handler: getAllFares,
      handlerParams: [req.query],
      successMessage: 'Fare list fetched successfully',
    },
    req,
    res,
  );
}

export function updateFareController(req, res) {
  return handleResponse(
    {
      handler: updateFare,
      // validationFn: null,
      handlerParams: [req.params, req.query, req.body],
      successMessage: 'Fare updated successfully',
    },
    req,
    res,
  );
}

export function deleteFareController(req, res) {
  return handleResponse(
    {
      handler: deleteFare,
      handlerParams: [req.query],
      successMessage: 'Fare deleted successfully',
    },
    req,
    res,
  );
}
