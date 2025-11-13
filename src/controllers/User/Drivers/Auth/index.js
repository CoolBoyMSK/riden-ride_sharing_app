import { handleResponse } from '../../../../utils/handleRespone.js';
import {
  signUpDriverWithEmail,
  signUpDriverWithPhone,
  loginUser,
  socialLoginUser,
  otpVerification,
  sendDriverPhoneOtp,
  sendDriverEmailOtp,
  forgotPassword,
  resetUserPassword,
  resendOtp,
  refreshAuthToken,
  updateFCMToken,
  biometricLogin,
} from '../../../../services/User/driver/Auth/index.js';

export const signUpDriverWithEmailController = (req, res) =>
  handleResponse(
    {
      handler: signUpDriverWithEmail,
      validationFn: null,
      handlerParams: [req.body],
      successMessage: 'Verify your email to complete registration',
    },
    req,
    res,
  );

export const signUpDriverWithPhoneController = (req, res) =>
  handleResponse(
    {
      handler: signUpDriverWithPhone,
      validationFn: null,
      handlerParams: [req.body],
      successMessage: 'Verify your phone number to complete registration',
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

export const sendDriverPhoneOtpController = (req, res) =>
  handleResponse(
    {
      handler: sendDriverPhoneOtp,
      validationFn: null,
      handlerParams: [req.body],
      successMessage: 'OTP sent to your phone number successfully',
    },
    req,
    res,
  );

export const sendDriverEmailOtpController = (req, res) =>
  handleResponse(
    {
      handler: sendDriverEmailOtp,
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

export const biometricLoginController = (req, res) =>
  handleResponse(
    {
      handler: biometricLogin,
      validationFn: null,
      handlerParams: [req.body],
      successMessage: 'Biometric login successfully',
    },
    req,
    res,
  );
