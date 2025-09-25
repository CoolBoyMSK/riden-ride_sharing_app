import { handleResponse } from '../../../utils/handleRespone.js';
import {
  getComplainTypes,
  createComplainTicket,
  getAllComplainTickets,
  getComplainTicketById,
  replySupportChat,
} from '../../../services/User/support/index.js';
import { validateComplainTicket } from '../../../validations/user/supportValidators.js';
import { validatePagination } from '../../../validations/pagination.js';

export const getComplainTypesController = async (req, res) =>
  handleResponse(
    {
      handler: getComplainTypes,
      handlerParams: [req.user],
      successMessage: 'Complain types fetched successfully',
    },
    req,
    res,
  );

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

export const replySupportChatController = async (req, res) =>
  handleResponse(
    {
      handler: replySupportChat,
      handlerParams: [req.user, req.params, req.body, req.files],
      successMessage: 'Support replied successfully',
    },
    req,
    res,
  );
