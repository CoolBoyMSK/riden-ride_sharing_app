import {
  loginUser,
  refreshTokens,
  resetUserPassword,
  signupUser,
} from '../../services/User/auth/index.js';
import { handleResponse } from '../../utils/handleRespone.js';
import {
  validateLogin,
  validateResetPassword,
  validateSignup,
} from '../../validations/user/authValidations.js';

export const signupController = (req, res) =>
  handleResponse(
    {
      handler: signupUser,
      validationFn: validateSignup,
      handlerParams: [req.body],
      successMessage: 'User registered successfully',
    },
    req,
    res,
  );

export const resetPasswordController = (req, res) =>
  handleResponse(
    {
      handler: resetUserPassword,
      validationFn: validateResetPassword,
      handlerParams: [req.body.newPassword, req.firebasePhone],
      successMessage: 'Password has been reset',
    },
    req,
    res,
  );

export const loginController = (req, res) =>
  handleResponse(
    {
      handler: loginUser,
      validationFn: validateLogin,
      handlerParams: [req.body],
      successMessage: 'User logged in successfully',
    },
    req,
    res,
  );

export const refreshController = (req, res) =>
  handleResponse(
    {
      handler: refreshTokens,
      validationFn: null,
      handlerParams: [req.body],
      successMessage: 'Tokens refreshed successfully',
    },
    req,
    res,
  );
