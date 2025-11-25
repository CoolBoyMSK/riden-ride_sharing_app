import { handleResponse } from '../../../utils/handleRespone.js';
import {
  getDriverFeedbacks,
  deleteFeedback,
  feedbackStats,
  getRequestedFeedbacks,
  toggleFeedbackRequest,
} from '../../../services/Admin/Feedback/index.js';

export const getDriverFeedbacksController = (req, res) =>
  handleResponse(
    {
      handler: getDriverFeedbacks,
      validationFn: null,
      handlerParams: [req.query],
      successMessage: 'Feedbacks fetched successfully',
    },
    req,
    res,
  );

export const deleteFeedbackController = (req, res) =>
  handleResponse(
    {
      handler: deleteFeedback,
      validationFn: null,
      handlerParams: [req.query],
      successMessage: 'Feedback deleted successfully',
    },
    req,
    res,
  );

export const feedbackStatsController = (req, res) =>
  handleResponse(
    {
      handler: feedbackStats,
      validationFn: null,
      handlerParams: [req.query],
      successMessage: 'Feedback status fetched successfully',
    },
    req,
    res,
  );

export const getRequestedFeedbacksController = (req, res) =>
  handleResponse(
    {
      handler: getRequestedFeedbacks,
      validationFn: null,
      handlerParams: [req.query],
      successMessage: 'Feedback requests fetched successfully',
    },
    req,
    res,
  );

export const toggleFeedbackRequestController = (req, res) =>
  handleResponse(
    {
      handler: toggleFeedbackRequest,
      validationFn: null,
      handlerParams: [req.params, req.query],
      successMessage: 'Feedback request approved successfully',
    },
    req,
    res,
  );
