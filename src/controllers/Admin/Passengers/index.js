import {
  blockPassenger,
  getPassengerById,
  deletePassengerById,
  getAllPassengers,
  unblockPassenger,
  getAllUpdateRequests,
  toggleUpdateRequest,
} from '../../../services/Admin/Passengers/index.js';
import { handleResponse } from '../../../utils/handleRespone.js';
import { validatePagination } from '../../../validations/pagination.js';
import { validateToggleUpdateRequest } from '../../../validations/admin/passengerValidations.js';

export const fetchAllPassengers = (req, res) =>
  handleResponse(
    {
      handler: getAllPassengers,
      validationFn: () =>
        validatePagination({ limit: req.query.limit, page: req.query.page }),
      handlerParams: [req.query],
      successMessage: 'Passengers fetched successfully',
    },
    req,
    res,
  );

export const getPassengerByIdController = (req, res) =>
  handleResponse(
    {
      handler: getPassengerById,
      handlerParams: [req.params],
      successMessage: 'Passenger fetched successfully',
    },
    req,
    res,
  );

export const deletePassengerByIdController = (req, res) =>
  handleResponse(
    {
      handler: deletePassengerById,
      handlerParams: [req.params],
      successMessage: 'Passenger deleted successfully',
    },
    req,
    res,
  );

export const blockPassengerController = (req, res) =>
  handleResponse(
    {
      handler: blockPassenger,
      handlerParams: [req.params.id],
      successMessage: 'Passenger blocked',
    },
    req,
    res,
  );

export const unblockPassengerController = (req, res) =>
  handleResponse(
    {
      handler: unblockPassenger,
      handlerParams: [req.params.id],
      successMessage: 'Passenger unblocked',
    },
    req,
    res,
  );

export const getAllUpdateRequestsController = (req, res) =>
  handleResponse(
    {
      handler: getAllUpdateRequests,
      validationFn: () =>
        validatePagination({ limit: req.query.limit, page: req.query.page }),
      handlerParams: [req.query],
      successMessage: 'Update Requests fetched successfully',
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
      successMessage: 'Request status updated successfully',
    },
    req,
    res,
  );
