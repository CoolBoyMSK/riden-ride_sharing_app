import {
  findDriverFeedbacks,
  deleteFeedbackById,
  getFeedbackStats,
  findRequestedFeedbacks,
  toggleFeedbackById,
} from '../../../dal/admin/index.js';

export const getDriverFeedbacks = async (
  { page, limit, search, fromDate, toDate, type },
  resp,
) => {
  try {
    const success = await findDriverFeedbacks({
      page,
      limit,
      search,
      fromDate,
      toDate,
      type,
    });
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to fetch feedbacks';
      return resp;
    }

    resp.data = success;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'something went wrong';
    return resp;
  }
};

export const deleteFeedback = async ({ id }, resp) => {
  try {
    const success = await deleteFeedbackById(id);
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to delete feedback';
      return resp;
    }

    resp.data = { success: true };
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'something went wrong';
    return resp;
  }
};

export const feedbackStats = async ({ type }, resp) => {
  try {
    const success = await getFeedbackStats(type);
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to fetch stats';
      return resp;
    }

    resp.data = success;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'something went wrong';
    return resp;
  }
};

export const getRequestedFeedbacks = async (
  { page = 1, limit = 10, type },
  resp,
) => {
  try {
    const success = await findRequestedFeedbacks(page, limit, type);
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to fetch feedback requests';
      return resp;
    }

    resp.data = success;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'something went wrong';
    return resp;
  }
};

export const toggleFeedbackRequest = async ({ id }, { status }, resp) => {
  try {
    const success = await toggleFeedbackById(id, { status });
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to approve feedback';
      return resp;
    }

    resp.data = success;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'something went wrong';
    return resp;
  }
};
