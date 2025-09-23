import { handleResponse } from '../../../utils/handleRespone.js';
import {
  getDriverFeedbacks,
  deleteFeedback,
  feedbackStats,
} from '../../../services/Admin/Feedback/index.js';

export const getDriverFeedbacksController = (req, res) =>
  handleResponse(
    {
      handler: getDriverFeedbacks,
      validationFn: null,
      handlerParams: [req.user, req.query],
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
      handlerParams: [req.user, req.query],
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
      handlerParams: [req.user, req.query],
      successMessage: 'Feedback status fetched successfully',
    },
    req,
    res,
  );
