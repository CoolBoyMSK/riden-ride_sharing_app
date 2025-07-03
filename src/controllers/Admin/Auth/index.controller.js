import {
  completeAdminPasswordReset,
  getAdminProfile,
  initiateAdminPasswordReset,
  loginService,
  refreshTokens,
} from '../../../services/Admin/Auth/index.js';
import { handleResponse } from '../../../utils/handleRespone.js';
import {
  validateAdminLogin,
  validateConfirmReset,
  validateRefresh,
  validateRequestReset,
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

export const requestAdminPasswordReset = (req, res) =>
  handleResponse(
    {
      handler: initiateAdminPasswordReset,
      validationFn: validateRequestReset,
      handlerParams: [req.body.email],
      successMessage: 'Password reset email sent',
    },
    req,
    res,
  );

export const confirmAdminPasswordReset = (req, res) =>
  handleResponse(
    {
      handler: completeAdminPasswordReset,
      validationFn: validateConfirmReset,
      handlerParams: [req.body.token, req.body.newPassword],
      successMessage: 'Password updated successfully',
    },
    req,
    res,
  );
