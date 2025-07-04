import {
  blockPassenger,
  getAllPassengers,
  unblockPassenger,
} from '../../../services/Admin/Passengers/index.js';
import { handleResponse } from '../../../utils/handleRespone.js';
import { validatePagination } from '../../../validations/pagination.js';

export const fetchAllPassengers = (req, res) =>
  handleResponse(
    {
      handler: getAllPassengers,
      validationFn: () => validatePagination(req.query),
      handlerParams: [req.query],
      successMessage: 'Passengers fetched successfully',
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
