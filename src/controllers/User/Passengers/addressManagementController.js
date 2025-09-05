import {
  getAddresses,
  addAddress,
  updateAddress,
  deleteAddress,
} from '../../../services/User/passenger/addressManagementService.js';
import { handleResponse } from '../../../utils/handleRespone.js';
import {
  validateAddAddress,
  validateUpdateAddress,
  validateDeleteAddress,
} from '../../../validations/user/passenger/addressManagementValidators.js';

export const getAddressesController = (req, res) => {
  handleResponse(
    {
      handler: getAddresses,
      validationFn: null,
      handlerParams: [req.user],
      successMessage: 'Address(es) fetched successfully',
    },
    req,
    res,
  );
};

export const addAddressController = (req, res) => {
  handleResponse(
    {
      handler: addAddress,
      validationFn: validateAddAddress,
      handlerParams: [req.user, req.body],
      successMessage: 'Address Added successfully',
    },
    req,
    res,
  );
};

export const updateAddressController = (req, res) => {
  handleResponse(
    {
      handler: updateAddress,
      validationFn: validateUpdateAddress,
      handlerParams: [req.user, req.body],
      successMessage: 'Address Updated successfully',
    },
    req,
    res,
  );
};

export const deleteAddressController = (req, res) => {
  handleResponse(
    {
      handler: deleteAddress,
      validationFn: validateDeleteAddress,
      handlerParams: [req.user, req.body],
      successMessage: 'Address Deleted Successfully',
    },
    req,
    res,
  );
};
