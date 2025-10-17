import { handleResponse } from '../../../../utils/handleRespone.js';
import {
  signUpPassenger,
  loginUser,
  socialLoginUser,
  otpVerification,
  sendPassengerPhoneOtp,
  forgotPassword,
  resetUserPassword,
  resendOtp,
  refreshAuthToken,
  updateFCMToken,
} from '../../../../services/User/passenger/Auth/index.js';

export const signUpPassengerController = (req, res) =>
  handleResponse(
    {
      handler: signUpPassenger,
      validationFn: null,
      handlerParams: [req.body],
      successMessage: 'Verify your email to complete registration',
    },
    req,
    res,
  );

export const loginUserController = (req, res) =>
  handleResponse(
    {
      handler: loginUser,
      validationFn: null,
      handlerParams: [req.body],
      successMessage: 'Verify OTP to sign in',
    },
    req,
    res,
  );

export const socialLoginUserController = (req, res) =>
  handleResponse(
    {
      handler: socialLoginUser,
      validationFn: null,
      handlerParams: [req.body, req],
      successMessage: 'Login successful',
    },
    req,
    res,
  );

export const otpVerificationController = (req, res) =>
  handleResponse(
    {
      handler: otpVerification,
      validationFn: null,
      handlerParams: [req.body, req],
      successMessage: 'OTP verified successfully',
    },
    req,
    res,
  );

export const sendPassengerPhoneOtpController = (req, res) =>
  handleResponse(
    {
      handler: sendPassengerPhoneOtp,
      validationFn: null,
      handlerParams: [req.body],
      successMessage: 'OTP sent to your phone number successfully',
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
      successMessage: 'Forgot password OTP sent successfully',
    },
    req,
    res,
  );

export const resetUserPasswordController = (req, res) =>
  handleResponse(
    {
      handler: resetUserPassword,
      validationFn: null,
      handlerParams: [req.body],
      successMessage: 'Password reset successfully',
    },
    req,
    res,
  );

export const resendOtpController = (req, res) =>
  handleResponse(
    {
      handler: resendOtp,
      validationFn: null,
      handlerParams: [req.body],
      successMessage: 'OTP resent successfully',
    },
    req,
    res,
  );

export const refreshAuthTokenController = (req, res) =>
  handleResponse(
    {
      handler: refreshAuthToken,
      validationFn: null,
      handlerParams: [req.body],
      successMessage: 'Token refreshed successfully',
    },
    req,
    res,
  );

export const updateFCMTokenController = (req, res) =>
  handleResponse(
    {
      handler: updateFCMToken,
      validationFn: null,
      handlerParams: [req.user, req.body],
      successMessage: 'FCM token updated successfully',
    },
    req,
    res,
  );
