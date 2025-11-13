import { handleResponse } from '../../../utils/handleRespone.js';
import {
  createRecoveryNumber,
  getRecoveryNumbers,
  editRecoveryNumber,
  removeRecoveryNumber,
  // fetchPasskeyRegisterOptions,
  // verifyAndSavePasskeyInDb,
  // toggle2FAStatus,
  getUserDevices,
  addBiometric,
  toggleBiometric,
} from '../../../services/User/Security/index.js';
import { validatePhoneNumber } from '../../../validations/driver.js';

export const createRecoveryNumberController = (req, res) =>
  handleResponse(
    {
      handler: createRecoveryNumber,
      validationFn: () => validatePhoneNumber(req.body),
      handlerParams: [req.user, req.body],
      successMessage: 'Recovery number added successfully',
    },
    req,
    res,
  );

export const getRecoveryNumbersController = (req, res) =>
  handleResponse(
    {
      handler: getRecoveryNumbers,
      validationFn: null,
      handlerParams: [req.user],
      successMessage: 'Recovery numbers fetched successfully',
    },
    req,
    res,
  );

export const editRecoveryNumberController = (req, res) =>
  handleResponse(
    {
      handler: editRecoveryNumber,
      validationFn: () => validatePhoneNumber(req.body),
      handlerParams: [req.user, req.query, req.body],
      successMessage: 'Recovery number updated successfully',
    },
    req,
    res,
  );

export const removeRecoveryNumberController = (req, res) =>
  handleResponse(
    {
      handler: removeRecoveryNumber,
      validationFn: null,
      handlerParams: [req.user, req.query],
      successMessage: 'Recovery number deleted successfully',
    },
    req,
    res,
  );

// export const fetchPasskeyRegisterOptionsController = (req, res) =>
//   handleResponse(
//     {
//       handler: fetchPasskeyRegisterOptions,
//       validationFn: null,
//       handlerParams: [req.user],
//       successMessage: 'Passkey registered successfully',
//     },
//     req,
//     res,
//   );

// export const verifyAndSavePasskeyInDbController = (req, res) =>
//   handleResponse(
//     {
//       handler: verifyAndSavePasskeyInDb,
//       validationFn: null,
//       handlerParams: [req.user, req.body],
//       successMessage: 'Passkey verified and stored successfully',
//     },
//     req,
//     res,
//   );

// export const toggle2FAStatusController = (req, res) =>
//   handleResponse(
//     {
//       handler: toggle2FAStatus,
//       validationFn: null,
//       handlerParams: [req.user],
//       successMessage: '2FA status toggled successfully',
//     },
//     req,
//     res,
//   );

export const getUserDevicesController = (req, res) =>
  handleResponse(
    {
      handler: getUserDevices,
      validationFn: null,
      handlerParams: [req.user],
      successMessage: 'Devices info fetched successfully',
    },
    req,
    res,
  );

export const addBiometricController = (req, res) =>
  handleResponse(
    {
      handler: addBiometric,
      validationFn: null,
      handlerParams: [req.user, req.body],
      successMessage: 'Biometric added successfully',
    },
    req,
    res,
  );

export const toggleBiometricController = (req, res) =>
  handleResponse(
    {
      handler: toggleBiometric,
      validationFn: null,
      handlerParams: [req.user],
      successMessage: 'Biometric toggled successfully',
    },
    req,
    res,
  );
