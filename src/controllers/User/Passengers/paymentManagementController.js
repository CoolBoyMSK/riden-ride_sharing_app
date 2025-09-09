import {
  addPaymentMethod,
  setDefaultPaymentMethod,
  getPaymentMethods,
  deletePaymentMethod,
} from '../../../services/User/passenger/paymentManagement.js';
import { handleResponse } from '../../../utils/handleRespone.js';
import {
  validatePaymentMethod,
  validateSetDefaultPaymentMethod,
} from '../../../validations/user/passenger/paymentManagementValidators.js';

export const addPaymentMethodController = (req, res) => {
  handleResponse(
    {
      handler: addPaymentMethod,
      validationFn: validatePaymentMethod,
      handlerParams: [req.user, req.body],
      successMessage: 'Payment Method Added successfully',
    },
    req,
    res,
  );
};

export const setDefaultPaymentMethodController = (req, res) => {
  handleResponse(
    {
      handler: setDefaultPaymentMethod,
      validationFn: validateSetDefaultPaymentMethod,
      handlerParams: [req.user, req.body],
      successMessage: 'Default Payment Method added successfully',
    },
    req,
    res,
  );
};

export const getPaymentMethodsController = (req, res) => {
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
};

export const deletePaymentMethodController = (req, res) => {
  handleResponse(
    {
      handler: deletePaymentMethod,
      validationFn: validateSetDefaultPaymentMethod,
      handlerParams: [req.user, req.body],
      successMessage: 'Payment Method deleted successfully',
    },
    req,
    res,
  );
};
