import { handleResponse } from '../../../../utils/handleRespone.js';
import {
  signUpPassenger,
  loginUser,
  otpVerification,
  sendPassengerPhoneOtp,
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
