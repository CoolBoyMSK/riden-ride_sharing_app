import {
  findDriverFeedbacks,
  deleteFeedbackById,
  getFeedbackStats,
} from '../../../dal/admin/index.js';

export const getDriverFeedbacks = async (
  user,
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

export const deleteFeedback = async (user, { id }, resp) => {
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

export const feedbackStats = async (user, { type }, resp) => {
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
