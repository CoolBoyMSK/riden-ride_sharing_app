import {
  addCardSetupIntent,
  addCard,
  setDefaultCard,
  getCards,
  getCardById,
  deleteCard,
  topUpInAppWallet,
  getInAppWallet,
  getTransactions,
  createWalletSetupIntent,
  deleteWallet,
  getPaymentIntent
} from '../../../services/User/passenger/paymentManagement.js';
import { handleResponse } from '../../../utils/handleRespone.js';

export const addCardSetupIntentController = (req, res) =>
  handleResponse(
    {
      handler: addCardSetupIntent,
      validationFn: null,
      handlerParams: [req.user],
      successMessage: 'Setup intent created successfully',
    },
    req,
    res,
  );

export const addCardController = (req, res) =>
  handleResponse(
    {
      handler: addCard,
      validationFn: null,
      handlerParams: [req.user, req.body],
      successMessage: 'Card Added successfully',
    },
    req,
    res,
  );

export const getCardsController = (req, res) =>
  handleResponse(
    {
      handler: getCards,
      validationFn: null,
      handlerParams: [req.user],
      successMessage: 'Cards fetched successfully',
    },
    req,
    res,
  );

export const getCardByIdController = (req, res) =>
  handleResponse(
    {
      handler: getCardById,
      validationFn: () => validateSetDefaultPaymentMethod(req.params),
      handlerParams: [req.user, req.params],
      successMessage: 'Card fetched successfully',
    },
    req,
    res,
  );

export const deleteCardController = (req, res) =>
  handleResponse(
    {
      handler: deleteCard,
      validationFn: null,
      handlerParams: [req.user, req.params],
      successMessage: 'Card deleted successfully',
    },
    req,
    res,
  );

export const setDefaultCardController = (req, res) =>
  handleResponse(
    {
      handler: setDefaultCard,
      validationFn: () => validateSetDefaultPaymentMethod(req.params),
      handlerParams: [req.user, req.params],
      successMessage: 'Default Card added successfully',
    },
    req,
    res,
  );

export const topUpInAppWalletController = (req, res) =>
  handleResponse(
    {
      handler: topUpInAppWallet,
      validationFn: () => validateSetDefaultPaymentMethod(req.params),
      handlerParams: [req.user, req.params, req.body],
      successMessage: 'Wallet top-up successfull',
    },
    req,
    res,
  );

export const getInAppWalletController = (req, res) =>
  handleResponse(
    {
      handler: getInAppWallet,
      validationFn: null,
      handlerParams: [req.user],
      successMessage: 'Wallet fetched successfully',
    },
    req,
    res,
  );

export const getTransactionsController = (req, res) =>
  handleResponse(
    {
      handler: getTransactions,
      validationFn: null,
      handlerParams: [req.user, req.query],
      successMessage: 'Wallet fetched successfully',
    },
    req,
    res,
  );

export const createWalletSetupIntentController = (req, res) =>
  handleResponse(
    {
      handler: createWalletSetupIntent,
      validationFn: null,
      handlerParams: [req.user, req.query],
      successMessage: 'Wallet setup intent created successfully',
    },
    req,
    res,
  );

export const deleteWalletController = (req, res) =>
  handleResponse(
    {
      handler: deleteWallet,
      validationFn: null,
      handlerParams: [req.user, req.query],
      successMessage: 'Wallet deleted successfully',
    },
    req,
    res,
  );

export const getPaymentIntentController = (req, res) =>
  handleResponse(
    {
      handler: getPaymentIntent,
      validationFn: null,
      handlerParams: [req.params],
      successMessage: 'Payment intent fetched successfully',
    },
    req,
    res,
  );