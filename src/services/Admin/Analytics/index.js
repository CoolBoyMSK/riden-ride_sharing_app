import { findGenericAnalytics } from '../../../dal/admin/index.js';

export const getGenericAnalytics = async (
  user,
  { filter, fromDate, toDate },
  resp,
) => {
  try {
    const success = await findGenericAnalytics(filter, fromDate, toDate);
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to fetch analytics';
      return resp;
    }

    resp.data = success;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'Something went wrong';
    return resp;
  }
};

export const getDriverAnalytics = async (user, resp) => {
  try {
    const success = await findGenericAnalytics(filter, fromDate, toDate);
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to fetch analytics';
      return resp;
    }

    resp.data = success;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'Something went wrong';
    return resp;
  }
};
