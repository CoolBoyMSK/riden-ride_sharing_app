import {
  findUpcomingPayouts,
  findPreviousPayouts,
  findInstantPayoutRequests,
  updateInstatnPayoutRequest,
  countTotalPendingRequests,
} from '../../../dal/payout.js';
import {
  transferToDriverAccount,
  refundCardPaymentToPassenger,
  refundWalletPaymentToPassenger,
} from '../../../dal/stripe.js';
import { findCompletedRide } from '../../../dal/driver.js';

export const getUpcomingPayouts = async (
  user,
  { page, limit, search },
  resp,
) => {
  try {
    const success = await findUpcomingPayouts({
      page,
      limit,
      search,
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
    const [requestsData, pendingCount] = await Promise.all([
      findInstantPayoutRequests({
        page,
        limit,
        search,
      }),
      countTotalPendingRequests(),
    ]);

    if (!requestsData) {
      resp.error = true;
      resp.error_message = 'Failed to fetch instant payout requests';
      return resp;
    }

    // Add pending count to response
    resp.data = {
      ...requestsData,
      pendingCount: pendingCount || 0,
    };
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

      success = await transferToDriverAccount(data.driverId, data._id);
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

    if (success === null || success === undefined || isNaN(success)) {
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

export const refundPassenger = async (user, { id, reason }, resp) => {
  try {
    let ride = await findCompletedRide(id);
    if (!ride) {
      resp.error = true;
      resp.error_message = 'Failed to find completed ride';
      return resp;
    }

    if (ride.paymentMethod === 'CARD') {
      const success = await refundCardPaymentToPassenger(ride._id, reason);
      if (!success) {
        resp.error = true;
        resp.error_message = 'Failed to refund card passenger';
        return resp;
      }

      resp.data = success;
      return resp;
    } else if (ride.paymentMethod === 'WALLET') {
      const success = await refundWalletPaymentToPassenger(ride._id, reason);
      console.log(success);
      if (!success) {
        resp.error = true;
        resp.error_message = 'Failed to refund wallet passenger';
        return resp;
      }

      resp.data = success;
      return resp;
    } else {
      resp.error = true;
      resp.error_message = 'Invalid payment method';
      return resp;
    }
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'Something went wrong';
    return resp;
  }
};
