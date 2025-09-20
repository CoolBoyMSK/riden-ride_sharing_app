import {
  addPaymentMethod,
  setDefaultPaymentMethod,
  getPaymentMethods,
  getPaymentMethodById,
  updatePaymentMethod,
  deletePaymentMethod,
  topUpInAppWallet,
  getInAppWallet,
} from '../../../services/User/passenger/paymentManagement.js';
import { handleResponse } from '../../../utils/handleRespone.js';
import {
  validatePaymentMethod,
  validateSetDefaultPaymentMethod,
  validateUpdatePaymentMethodId,
} from '../../../validations/user/passenger/paymentManagementValidators.js';

export const addPaymentMethodController = (req, res) =>
  handleResponse(
    {
      handler: addPaymentMethod,
      validationFn: () => validatePaymentMethod(req.body),
      handlerParams: [req.user, req.body],
      successMessage: 'Payment Method Added successfully',
    },
    req,
    res,
  );

export const setDefaultPaymentMethodController = (req, res) =>
  handleResponse(
    {
      handler: setDefaultPaymentMethod,
      validationFn: () => validateSetDefaultPaymentMethod(req.params),
      handlerParams: [req.user, req.params],
      successMessage: 'Default Payment Method added successfully',
    },
    req,
    res,
  );

export const getPaymentMethodsController = (req, res) =>
  handleResponse(
    {
      handler: getPaymentMethods,
      validationFn: null,
      handlerParams: [req.user],
      successMessage: 'Payment Methods fetched successfully',
    },
    req,
    res,
  );

export const getPaymentMethodByIdController = (req, res) =>
  handleResponse(
    {
      handler: getPaymentMethodById,
      validationFn: () => validateSetDefaultPaymentMethod(req.params),
      handlerParams: [req.user, req.params],
      successMessage: 'Payment Method fetched successfully',
    },
    req,
    res,
  );

export const updatePaymentMethodController = (req, res) =>
  handleResponse(
    {
      handler: updatePaymentMethod,
      validationFn: () =>
        validateUpdatePaymentMethodId({
          paymentMethodId: req.params.paymentMethodId,
          card: req.body,
        }),
      handlerParams: [req.user, req.params, req.body],
      successMessage: 'Payment Methods updated successfully',
    },
    req,
    res,
  );

export const deletePaymentMethodController = (req, res) =>
  handleResponse(
    {
      handler: deletePaymentMethod,
      validationFn: () => validateSetDefaultPaymentMethod(req.params),
      handlerParams: [req.user, req.params],
      successMessage: 'Payment Method deleted successfully',
    },
    req,
    res,
  );

export const topUpInAppWalletController = (req, res) =>
  handleResponse(
    {
      handler: topUpInAppWallet,
      validationFn: () => validateSetDefaultPaymentMethod(req.params),
      handlerParams: [req.user, req.params, req.body],
      successMessage: 'Wallet top-up successfull',
    },
    req,
    res,
  );

export const getInAppWalletController = (req, res) =>
  handleResponse(
    {
      handler: getInAppWallet,
      validationFn: null,
      handlerParams: [req.user],
      successMessage: 'Wallet fetched successfully',
    },
    req,
    res,
  );
