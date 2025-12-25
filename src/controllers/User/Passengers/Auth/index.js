import { handleResponse } from '../../../../utils/handleRespone.js';
import {
  signUpPassengerWithEmail,
  signUpPassengerWithPhone,
  signUpPassengerWithPhonePasswordless,
  loginUser,
  loginPassengerWithPhonePasswordless,
  socialLoginUser,
  otpVerification,
  sendPassengerPhoneOtp,
  sendPassengerEmailOtp,
  forgotPassword,
  resetUserPassword,
  resendOtp,
  refreshAuthToken,
  updateFCMToken,
} from '../../../../services/User/passenger/Auth/index.js';

export const signUpPassengerWithEmailController = (req, res) =>
  handleResponse(
    {
      handler: signUpPassengerWithEmail,
      validationFn: null,
      handlerParams: [req.body],
      successMessage: 'Verify your email to complete registration',
    },
    req,
    res,
  );

export const signUpPassengerWithPhoneController = (req, res) =>
  handleResponse(
    {
      handler: signUpPassengerWithPhone,
      validationFn: null,
      handlerParams: [req.body],
      successMessage: 'Verify your phone number to complete registration',
    },
    req,
    res,
  );

export const signUpPassengerWithPhonePasswordlessController = (req, res) =>
  handleResponse(
    {
      handler: signUpPassengerWithPhonePasswordless,
      validationFn: null,
      handlerParams: [req.body],
      successMessage: 'OTP sent to your phone number. Please verify to complete registration',
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

export const loginPassengerWithPhonePasswordlessController = (req, res) =>
  handleResponse(
    {
      handler: loginPassengerWithPhonePasswordless,
      validationFn: null,
      handlerParams: [req.body],
      successMessage: 'OTP sent to your phone number. Please verify to login',
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

export const sendPassengerEmailOtpController = (req, res) =>
  handleResponse(
    {
      handler: sendPassengerEmailOtp,
      validationFn: null,
      handlerParams: [req.body],
      successMessage: 'OTP sent to your email successfully',
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
