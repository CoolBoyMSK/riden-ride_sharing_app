import {
  getUserProfile,
  updateUserProfile,
  sendEmailUpdateOtp,
  verifyEmailUpdate,
  sendPhoneUpdateOtp,
  verifyPhoneUpdate,
  // verifyBothEmailAndPhoneUpdate,
} from '../../services/User/profileService.js';
import { handleResponse } from '../../utils/handleRespone.js';
import { validateProfileUpdate } from '../../validations/user/profileValidations.js';

export const fetchProfile = (req, res) =>
  handleResponse(
    {
      handler: getUserProfile,
      handlerParams: [req.user],
      successMessage: 'Profile fetched successfully',
    },
    req,
    res,
  );

export const editProfile = (req, res) =>
  handleResponse(
    {
      handler: updateUserProfile,
      // validationFn: validateProfileUpdate,
      handlerParams: [req.user, req.body, req.file],
      successMessage: 'Profile updated successfully',
    },
    req,
    res,
  );

export const sendEmailUpdateOtpController = (req, res) =>
  handleResponse(
    {
      handler: sendEmailUpdateOtp,
      validationFn: null,
      handlerParams: [req.user, req.body],
      successMessage: 'Email update otp sent successfully',
    },
    req,
    res,
  );

export const verifyEmailUpdateController = (req, res) =>
  handleResponse(
    {
      handler: verifyEmailUpdate,
      validationFn: null,
      handlerParams: [req.user, req.body],
      successMessage: 'Email otp verified successfully',
    },
    req,
    res,
  );

export const sendPhoneUpdateOtpController = (req, res) =>
  handleResponse(
    {
      handler: sendPhoneUpdateOtp,
      validationFn: null,
      handlerParams: [req.user, req.body],
      successMessage: 'Phone Number update otp sent successfully',
    },
    req,
    res,
  );

export const verifyPhoneUpdateController = (req, res) =>
  handleResponse(
    {
      handler: verifyPhoneUpdate,
      validationFn: null,
      handlerParams: [res.user, req.body],
      successMessage: 'Phone Number otp verified successfully',
    },
    req,
    res,
  );

// export const verifyBothEmailAndPhoneUpdateController = (req, res) =>
//   handleResponse(
//     {
//       handler: verifyBothEmailAndPhoneUpdate,
//       validationFn: null,
//       handlerParams: [res.user, req.body],
//       successMessage: 'Phone Number and email otp verified successfully',
//     },
//     req,
//     res,
//   );
