import { handleResponse } from '../../../utils/handleRespone.js';
import {
  getUpcomingPayouts,
  getPreviousPayouts,
  getInstantPayoutRequests,
  editInstantPayoutRequest,
  getInstantPayoutRequestsCount,
  refundPassenger,
} from '../../../services/Admin/Payout/index.js';

export const getUpcomingPayoutsController = (req, res) =>
  handleResponse(
    {
      handler: getUpcomingPayouts,
      validationFn: null,
      handlerParams: [req.user, req.query],
      successMessage: 'Upcoming payouts fetched successfully',
    },
    req,
    res,
  );

export const getPreviousPayoutsController = (req, res) =>
  handleResponse(
    {
      handler: getPreviousPayouts,
      validationFn: null,
      handlerParams: [req.user, req.query],
      successMessage: 'Previous payouts fetched successfully',
    },
    req,
    res,
  );

export const getInstantPayoutRequestsController = (req, res) =>
  handleResponse(
    {
      handler: getInstantPayoutRequests,
      validationFn: null,
      handlerParams: [req.user, req.query],
      successMessage: 'Instant payout requests fetched successfully',
    },
    req,
    res,
  );

export const editInstantPayoutRequestController = (req, res) =>
  handleResponse(
    {
      handler: editInstantPayoutRequest,
      validationFn: null,
      handlerParams: [req.user, req.query],
      successMessage: 'Instant payout request status updated successfully',
    },
    req,
    res,
  );

export const getInstantPayoutRequestsCountController = (req, res) =>
  handleResponse(
    {
      handler: getInstantPayoutRequestsCount,
      validationFn: null,
      handlerParams: [req.user],
      successMessage:
        'Number of total pennding payout requests fetched successfully',
    },
    req,
    res,
  );

export const refundPassengerController = (req, res) =>
  handleResponse(
    {
      handler: refundPassenger,
      validationFn: null,
      handlerParams: [req.user, req.query],
      successMessage: 'Passenger refunded successfully',
    },
    req,
    res,
  );
