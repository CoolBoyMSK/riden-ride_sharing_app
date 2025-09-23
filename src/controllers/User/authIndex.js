import {
  loginUser,
  refreshTokens,
  resetUserPassword,
  signupUser,
  otpVerification,
  forgotPassword,
  passKeyLogInAuthOptions,
  verifyPasskeyLoginAuth,
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
      handlerParams: [req.user, req.body],
      successMessage: 'User registered successfully',
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

export const otpVerificationController = (req, res) =>
  handleResponse(
    {
      handler: otpVerification,
      validationFn: null, // you may add validateOtp if you create one
      handlerParams: [req.body],
      successMessage: 'OTP verified successfully',
    },
    req,
    res,
  );

export const forgotPasswordController = (req, res) =>
  handleResponse(
    {
      handler: forgotPassword,
      validationFn: null,
      handlerParams: [req.body],
      successMessage: 'OTP sent for password reset',
    },
    req,
    res,
  );

export const resetPasswordController = (req, res) =>
  handleResponse(
    {
      handler: resetUserPassword,
      validationFn: validateResetPassword,
      handlerParams: [req.body],
      successMessage: 'Password has been reset',
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

export const passKeyLogInAuthOptionsController = (req, res) =>
  handleResponse(
    {
      handler: passKeyLogInAuthOptions,
      validationFn: null,
      handlerParams: [req.body],
      successMessage: 'Passkey login options created successfully',
    },
    req,
    res,
  );

export const verifyPasskeyLoginAuthController = (req, res) =>
  handleResponse(
    {
      handler: verifyPasskeyLoginAuth,
      validationFn: null,
      handlerParams: [req.body],
      successMessage: 'Passkey login successfully',
    },
    req,
    res,
  );
