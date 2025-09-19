import { handleResponse } from '../../../utils/handleRespone.js';
import {
  createComplainTicket,
  getAllComplainTickets,
  getComplainTicketById,
} from '../../../services/User/support/index.js';
import { validateComplainTicket } from '../../../validations/user/supportValidators.js';
import { validatePagination } from '../../../validations/pagination.js';

export const createComplainTicketController = async (req, res) =>
  handleResponse(
    {
      handler: createComplainTicket,
      validationFn: () =>
        validateComplainTicket({ ...req.body, files: req.files }),
      handlerParams: [req.user, req.body, req.files],
      successMessage: 'Complain resgistered successfully',
    },
    req,
    res,
  );

export const getAllComplainTicketsController = async (req, res) =>
  handleResponse(
    {
      handler: getAllComplainTickets,
      validationFn: () => validatePagination(req.query),
      handlerParams: [req.user, req.query],
      successMessage: 'Complains fetched successfully',
    },
    req,
    res,
  );

export const getComplainTicketByIdController = async (req, res) =>
  handleResponse(
    {
      handler: getComplainTicketById,
      handlerParams: [req.user, req.params],
      successMessage: 'Complain fetched successfully',
    },
    req,
    res,
  );
