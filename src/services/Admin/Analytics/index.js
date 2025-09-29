import {
  findGenericAnalytics,
  driversAnalytics,
  passengersAnalytics,
  ridesAnalytics,
  financialAnalytics,
} from '../../../dal/admin/index.js';

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

export const getDriversAnalytics = async (user, { filter }, resp) => {
  try {
    const success = await driversAnalytics(filter);
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to fetch driver analytics';
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

export const getPassengersAnalytics = async (user, { filter }, resp) => {
  try {
    const success = await passengersAnalytics(filter);
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to fetch passegers analytics';
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

export const getRidesAnalytics = async (user, { filter }, resp) => {
  try {
    const success = await ridesAnalytics(filter);
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to fetch rides analytics';
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

export const getFinancialAnalytics = async (user, { filter }, resp) => {
  try {
    const success = await financialAnalytics(filter);
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to fetch financial analytics';
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
