import { handleResponse } from '../../../../utils/handleRespone.js';
import {
  addPayoutMethod,
  onBoardDriver,
  driverIdentityVerification,
  sendAdditionalDocument,
  sendLicenseFront,
  sendLicenseBack,
  getIdentityVerificationStatus,
  getConnectedAccountStatus,
  getDriverStripeAccount,
  getAllPayoutMethods,
  getPayoutMethodById,
  deletePayoutMethod,
  setDefaultPayoutMethod,
  sendInstantPayoutRequest,
  sendPayoutToDriverBank,
  instantPayoutWithFee,
} from '../../../../services/User/driver/payment/index.js';

export const addPayoutMethodController = (req, res) =>
  handleResponse(
    {
      handler: addPayoutMethod,
      validationFn: null,
      handlerParams: [req.user, req.body],
      successMessage: 'Payout Method Added successfully',
    },
    req,
    res,
  );

export const onBoardDriverController = (req, res) =>
  handleResponse(
    {
      handler: onBoardDriver,
      validationFn: null,
      handlerParams: [req.user, req.body, req.ip],
      successMessage: 'Driver onboard successfully',
    },
    req,
    res,
  );

export const driverIdentityVerificationController = (req, res) =>
  handleResponse(
    {
      handler: driverIdentityVerification,
      validationFn: null,
      handlerParams: [req.user],
      successMessage: 'Driver Identitfy verification link sent successfully',
    },
    req,
    res,
  );

export const sendAdditionalDocumentController = (req, res) =>
  handleResponse(
    {
      handler: sendAdditionalDocument,
      validationFn: null,
      handlerParams: [req.user, req.file],
      successMessage: 'Additional Document uploaded successfully',
    },
    req,
    res,
  );

export const sendLicenseFrontController = (req, res) =>
  handleResponse(
    {
      handler: sendLicenseFront,
      validationFn: null,
      handlerParams: [req.user, req.file],
      successMessage: 'License front uploaded successfully',
    },
    req,
    res,
  );

export const sendLicenseBackController = (req, res) =>
  handleResponse(
    {
      handler: sendLicenseBack,
      validationFn: null,
      handlerParams: [req.user, req.file],
      successMessage: 'License back uploaded successfully',
    },
    req,
    res,
  );

export const getIdentityVerificationStatusController = (req, res) =>
  handleResponse(
    {
      handler: getIdentityVerificationStatus,
      validationFn: null,
      handlerParams: [req.user, req.query],
      successMessage:
        'Driver stripe identity verification status fetched successfully',
    },
    req,
    res,
  );

export const getConnectedAccountStatusController = (req, res) =>
  handleResponse(
    {
      handler: getConnectedAccountStatus,
      validationFn: null,
      handlerParams: [req.user],
      successMessage: 'Driver account status fetched successfully',
    },
    req,
    res,
  );

export const getDriverStripeAccountController = (req, res) =>
  handleResponse(
    {
      handler: getDriverStripeAccount,
      validationFn: null,
      handlerParams: [req.user],
      successMessage: 'Stripe account created successfully',
    },
    req,
    res,
  );

export const getAllPayoutMethodsController = (req, res) =>
  handleResponse(
    {
      handler: getAllPayoutMethods,
      validationFn: null,
      handlerParams: [req.user],
      successMessage: 'Payout methods fetched successfully',
    },
    req,
    res,
  );

export const getPayoutMethodByIdController = (req, res) =>
  handleResponse(
    {
      handler: getPayoutMethodById,
      validationFn: null,
      handlerParams: [req.user, req.params],
      successMessage: 'Payout method fetched successfully',
    },
    req,
    res,
  );

export const deletePayoutMethodController = (req, res) =>
  handleResponse(
    {
      handler: deletePayoutMethod,
      validationFn: null,
      handlerParams: [req.user, req.params],
      successMessage: 'Payout method deleted successfully',
    },
    req,
    res,
  );

export const setDefaultPayoutMethodController = (req, res) =>
  handleResponse(
    {
      handler: setDefaultPayoutMethod,
      validationFn: null,
      handlerParams: [req.user, req.params],
      successMessage: 'Default payout method successfully',
    },
    req,
    res,
  );

export const sendInstantPayoutRequestController = (req, res) =>
  handleResponse(
    {
      handler: sendInstantPayoutRequest,
      validationFn: null,
      handlerParams: [req.user],
      successMessage: 'Payout request sent successfully',
    },
    req,
    res,
  );

export const sendPayoutToDriverBankController = (req, res) =>
  handleResponse(
    {
      handler: sendPayoutToDriverBank,
      validationFn: null,
      handlerParams: [req.user, req.body],
      successMessage: 'Payout sent to bank successfully',
    },
    req,
    res,
  );

export const instantPayoutWithFeeController = (req, res) =>
  handleResponse(
    {
      handler: instantPayoutWithFee,
      validationFn: null,
      handlerParams: [req.user],
      successMessage: 'Instant payout processed successfully',
    },
    req,
    res,
  );
