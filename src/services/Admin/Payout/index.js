import {
  findUpcomingPayouts,
  findPreviousPayouts,
  findInstantPayoutRequests,
  updateInstatnPayoutRequest,
  countTotalPendingRequests,
} from '../../../dal/payout.js';
import {
  instantPayoutDriver,
  refundCardPayment,
  findTransaction,
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

export const refundPassenger = async (user, { rideId }, resp) => {
  try {
    const ride = await findCompletedRide(rideId);
    if (!ride) {
      resp.error = true;
      resp.error_message = 'Failed to find completed ride';
      return resp;
    }

    const transaction = await findTransaction({ rideId, type: 'CREDIT' });

    if (transaction.paymentMethodId) {
      const success = await refundCardPayment(
        transaction.referenceId,
        transaction.amount,
        ride.driverId,
        ride.passengerId,
        ride,
      );
      if (!success) {
        resp.error = true;
        resp.error_message = 'Failed to refund passenger';
        return resp;
      }

      resp.data = success;
      return resp;
    }

    if (transaction.walletId) {
      const success = await refundCardPayment(
        transaction.referenceId,
        transaction.amount,
        ride.driverId,
        ride.passengerId,
        ride,
      );
      if (!success) {
        resp.error = true;
        resp.error_message = 'Failed to refund passenger';
        return resp;
      }

      resp.data = success;
      return resp;
    }
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'Something went wrong';
    return resp;
  }
};
