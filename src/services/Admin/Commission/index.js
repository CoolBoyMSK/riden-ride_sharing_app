import {
  findCommissions,
  addOrUpdateCommission,
  findAdminCommissions,
  findComissionStats,
} from '../../../dal/admin/index.js';

export const setCommission = async (user, { carType, percentage }, resp) => {
  try {
    const success = await addOrUpdateCommission({ carType, percentage });
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to set commissions';
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

export const getCommissions = async (user, resp) => {
  try {
    const success = await findCommissions();
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to fetch commissions';
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

export const getAdminCommissions = async (
  user,
  { page, limit, search, fromDate, toDate },
  resp,
) => {
  try {
    const success = await findAdminCommissions({
      page,
      limit,
      search,
      fromDate,
      toDate,
    });
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to fetch admin commissions';
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

export const getCommissionStats = async (user, resp) => {
  try {
    const success = await findComissionStats();
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to fetch commission stats';
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
