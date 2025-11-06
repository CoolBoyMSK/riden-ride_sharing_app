import {
  addFare,
  getAllFares,
  getAllFareById,
  updateFare,
  deleteFare,
} from '../../../services/Admin/fareManagement/index.js';
import { handleResponse } from '../../../utils/handleRespone.js';

export const addFareController = (req, res) => {
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
};

export const getAllFaresController = (req, res) => {
  return handleResponse(
    {
      handler: getAllFares,
      handlerParams: [req.query],
      successMessage: 'Fare list fetched successfully',
    },
    req,
    res,
  );
};

export const getAllFareByIdController = (req, res) => {
  return handleResponse(
    {
      handler: getAllFareById,
      handlerParams: [req.query],
      successMessage: 'Fare list fetched successfully',
    },
    req,
    res,
  );
};

export const updateFareController = (req, res) => {
  return handleResponse(
    {
      handler: updateFare,
      // validationFn: null,
      handlerParams: [req.query, req.body],
      successMessage: 'Fare updated successfully',
    },
    req,
    res,
  );
};

export const deleteFareController = (req, res) => {
  return handleResponse(
    {
      handler: deleteFare,
      handlerParams: [req.query],
      successMessage: 'Fare deleted successfully',
    },
    req,
    res,
  );
};
