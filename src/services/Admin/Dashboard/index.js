import {
  findActiveDriversCount,
  findOngoingRideInfo,
} from '../../../dal/admin/index.js';

export const getActiveDriversCount = async (user, resp) => {
  try {
    const success = await findActiveDriversCount();
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to fetch active drivers';
      return resp;
    }

    resp.data = { activeDrivers: success };
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'Something went wrong';
    return resp;
  }
};

export const getOngoingRideInfo = async (user, { id }, resp) => {
  try {
    const success = await findOngoingRideInfo(id);
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to fetch ongoing ride details';
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
