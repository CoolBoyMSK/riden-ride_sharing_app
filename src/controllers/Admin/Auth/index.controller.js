import {
  getAdminProfile,
  loginService,
  refreshTokens,
} from '../../../services/Admin/Auth/index.js';
import { handleResponse } from '../../../utils/handleRespone.js';
import {
  validateAdminLogin,
  validateRefresh,
} from '../../../validations/admin/authValidations.js';

export const loginAdmin = (req, res) => {
  return handleResponse(
    {
      handler: loginService,
      validationFn: validateAdminLogin,
      handlerParams: [req.body],
      successMessage: 'Admin logged in successfully',
    },
    req,
    res,
  );
};

export const refreshAdmin = (req, res) => {
  return handleResponse(
    {
      handler: refreshTokens,
      validationFn: validateRefresh,
      handlerParams: [req.body],
      successMessage: 'Tokens refreshed successfully',
    },
    req,
    res,
  );
};

export const getCurrentAdmin = (req, res) =>
  handleResponse(
    {
      handler: getAdminProfile,
      handlerParams: [req.user],
      successMessage: 'Fetched current admin profile',
    },
    req,
    res,
  );
