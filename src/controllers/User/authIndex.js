import {
  resetUserPassword,
  signupUser,
} from '../../services/User/auth/index.js';
import { handleResponse } from '../../utils/handleRespone.js';
import {
  validateResetPassword,
  validateSignup,
} from '../../validations/user/signupValidations.js';

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
