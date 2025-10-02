import {
  findUpcomingPayouts,
  findPreviousPayouts,
  findInstantPayoutRequests,
  updateInstatnPayoutRequest,
  countTotalPendingRequests,
} from '../../../dal/payout.js';
import { instantPayoutDriver } from '../../../dal/stripe.js';

export const getUpcomingPayouts = async (
  user,
  { page, limit, search, toDate, fromDate },
  resp,
) => {
  try {
    const success = await findUpcomingPayouts({
      page,
      limit,
      search,
      toDate,
      fromDate,
    });
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to fetch upcoming payouts';
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

export const getPreviousPayouts = async (
  user,
  { page, limit, search, toDate, fromDate },
  resp,
) => {
  try {
    const success = await findPreviousPayouts({
      page,
      limit,
      search,
      toDate,
      fromDate,
    });
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to fetch previous payouts';
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

export const getInstantPayoutRequests = async (
  user,
  { page, limit, search },
  resp,
) => {
  try {
    const success = await findInstantPayoutRequests({
      page,
      limit,
      search,
    });
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to fetch instant payout requests';
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

export const editInstantPayoutRequest = async (user, { id, status }, resp) => {
  try {
    let success;
    if (status === 'APPROVED') {
      const data = await updateInstatnPayoutRequest({
        id,
        status,
        approvedAt: new Date(),
      });
      if (!data) {
        resp.error = true;
        resp.error_message = 'Failed to update instant payout request status';
        return resp;
      }
      
      success = await instantPayoutDriver(data.driverId, data._id);
      if (!success) {
        resp.error = true;
        resp.error_message = 'Failed to pay driver';
        return resp;
      }
    } else {
      success = await updateInstatnPayoutRequest({
        id,
        status: 'REJECTED',
      });
      if (!success) {
        resp.error = true;
        resp.error_message = 'Failed to update instant payout request status';
        return resp;
      }
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

export const getInstantPayoutRequestsCount = async (user, resp) => {
  try {
    const success = await countTotalPendingRequests();
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to fetch pending requests count';
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
