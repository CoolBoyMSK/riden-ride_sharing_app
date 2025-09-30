import { handleResponse } from '../../../../utils/handleRespone.js';
import {
  addPayoutMethod,
  onBoardDriver,
  getDriverStripeAccount,
  getAllPayoutMethods,
  getPayoutMethodById,
  updatePayoutMethod,
  deletePayoutMethod,
  setDefaultPayoutMethod,
  sendInstantPayoutRequest,
} from '../../../../services/User/driver/payment/index.js';

export const addPayoutMethodController = (req, res) =>
  handleResponse(
    {
      handler: addPayoutMethod,
      validationFn: null,
      handlerParams: [req.user, req.body],
      successMessage: 'Payout Method Added successfully',
    },
    req,
    res,
  );

export const onBoardDriverController = (req, res) =>
  handleResponse(
    {
      handler: onBoardDriver,
      validationFn: null,
      handlerParams: [req.user, req.body, req.ip],
      successMessage: 'Driver onboard successfully',
    },
    req,
    res,
  );

export const getDriverStripeAccountController = (req, res) =>
  handleResponse(
    {
      handler: getDriverStripeAccount,
      validationFn: null,
      handlerParams: [req.user],
      successMessage: 'Stripe account created successfully',
    },
    req,
    res,
  );

export const getAllPayoutMethodsController = (req, res) =>
  handleResponse(
    {
      handler: getAllPayoutMethods,
      validationFn: null,
      handlerParams: [req.user],
      successMessage: 'Payout methods fetched successfully',
    },
    req,
    res,
  );

export const getPayoutMethodByIdController = (req, res) =>
  handleResponse(
    {
      handler: getPayoutMethodById,
      validationFn: null,
      handlerParams: [req.user, req.params],
      successMessage: 'Payout method fetched successfully',
    },
    req,
    res,
  );

export const updatePayoutMethodController = (req, res) =>
  handleResponse(
    {
      handler: updatePayoutMethod,
      validationFn: null,
      handlerParams: [req.user, req.params, req.body],
      successMessage: 'Payout method updated successfully',
    },
    req,
    res,
  );

export const deletePayoutMethodController = (req, res) =>
  handleResponse(
    {
      handler: deletePayoutMethod,
      validationFn: null,
      handlerParams: [req.user, req.params],
      successMessage: 'Payout method deleted successfully',
    },
    req,
    res,
  );

export const setDefaultPayoutMethodController = (req, res) =>
  handleResponse(
    {
      handler: setDefaultPayoutMethod,
      validationFn: null,
      handlerParams: [req.user, req.params],
      successMessage: 'Default payout method successfully',
    },
    req,
    res,
  );

export const sendInstantPayoutRequestController = (req, res) =>
  handleResponse(
    {
      handler: sendInstantPayoutRequest,
      validationFn: null,
      handlerParams: [req.user],
      successMessage: 'Payout request sent successfully',
    },
    req,
    res,
  );
