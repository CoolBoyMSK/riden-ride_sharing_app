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
  cancelPaymentHold,
} from '../../../dal/stripe.js';
import { findCompletedRide } from '../../../dal/driver.js';
import { updateRideById } from '../../../dal/ride.js';

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
    // Validate ID format
    if (!id) {
      resp.error = true;
      resp.error_message = 'Ride ID is required';
      return resp;
    }

    const mongoose = (await import('mongoose')).default;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      resp.error = true;
      resp.error_message = `Invalid ride ID format: ${id}`;
      return resp;
    }

    // Check if ride exists
    const RideModel = (await import('../../../models/Ride.js')).default;
    const ride = await RideModel.findById(id)
      .populate('passengerId driverId')
      .lean();

    if (!ride) {
      resp.error = true;
      resp.error_message = `Ride not found with ID: ${id}`;
      return resp;
    }

    // Check ride status
    if (ride.status !== 'RIDE_COMPLETED') {
      resp.error = true;
      resp.error_message = `Ride is not completed. Current status: ${ride.status || 'UNKNOWN'}`;
      return resp;
    }

    // Check payment status - allow PROCESSING and COMPLETED
    if (ride.paymentStatus !== 'COMPLETED' && ride.paymentStatus !== 'PROCESSING') {
      resp.error = true;
      resp.error_message = `Payment cannot be refunded. Current payment status: ${ride.paymentStatus || 'UNKNOWN'}. Only PROCESSING or COMPLETED payments can be refunded.`;
      return resp;
    }

    // Check if already refunded - multiple indicators
    const RefundTransaction = (await import('../../../models/RefundTransaction.js')).default;
    const TransactionModel = (await import('../../../models/Transaction.js')).default;
    const RideTransaction = (await import('../../../models/RideTransaction.js')).default;

    // Check 1: RefundTransaction record
    const existingRefund = await RefundTransaction.findOne({ rideId: id });
    if (existingRefund) {
      resp.error = true;
      resp.error_message = `Ride has already been refunded. Refund ID: ${existingRefund._id}`;
      return resp;
    }

    // Check 2: Payment status is REFUNDED
    if (ride.paymentStatus === 'REFUNDED') {
      resp.error = true;
      resp.error_message = `Ride payment status is already REFUNDED. Cannot process refund again.`;
      return resp;
    }

    // Check 3: Check if transactions are marked as refunded
    const refundedTransaction = await TransactionModel.findOne({
      rideId: id,
      type: 'DEBIT',
      for: 'passenger',
      isRefunded: true,
    });
    if (refundedTransaction) {
      resp.error = true;
      resp.error_message = `Ride has already been refunded. Transaction ID: ${refundedTransaction._id}`;
      return resp;
    }

    // Check 4: Check RideTransaction status
    const refundedRideTransaction = await RideTransaction.findOne({
      rideId: id,
      status: 'REFUNDED',
    });
    if (refundedRideTransaction) {
      resp.error = true;
      resp.error_message = `Ride transaction is already marked as REFUNDED. Cannot process refund again.`;
      return resp;
    }

    // Handle PROCESSING status - check if payment was captured (transactions exist)
    if (ride.paymentStatus === 'PROCESSING') {
      const existingTransaction = await TransactionModel.findOne({
        rideId: id,
        type: 'DEBIT',
        status: 'succeeded',
        for: 'passenger',
        isRefunded: false,
      });

      // If no transaction exists but paymentIntentId exists, cancel the payment hold
      if (!existingTransaction && ride.paymentIntentId) {
        const cancelResult = await cancelPaymentHold(ride.paymentIntentId);
        if (!cancelResult.success) {
          resp.error = true;
          resp.error_message = `Failed to cancel payment hold: ${cancelResult.error || 'Unknown error'}`;
          return resp;
        }

        // Get passenger and driver IDs (handle both populated and non-populated cases)
        const passengerId = ride.passengerId?._id || ride.passengerId;
        const driverId = ride.driverId?._id || ride.driverId;
        const refundAmount = ride.actualFare || ride.fareBreakdown?.finalAmount || 0;

        if (!passengerId || !driverId) {
          resp.error = true;
          resp.error_message = 'Passenger or driver information not found';
          return resp;
        }

        // Update ride payment status to REFUNDED
        await updateRideById(id, {
          paymentStatus: 'REFUNDED',
        });

        // Create refund transaction record
        await RefundTransaction.create({
          rideId: id,
          passengerId: passengerId,
          driverId: driverId,
          refundAmount: refundAmount,
          refundReason: reason || 'Payment hold cancelled by admin',
          resolvedBy: 'admin',
        });

        resp.data = {
          success: true,
          refundType: 'PAYMENT_HOLD_CANCELLED',
          message: 'Payment hold cancelled successfully',
          paymentIntentId: ride.paymentIntentId,
          refundAmount: refundAmount,
        };
        return resp;
      }

      // If no transaction and no paymentIntentId, payment might be in an invalid state
      if (!existingTransaction && !ride.paymentIntentId) {
        resp.error = true;
        resp.error_message = 'Payment is in PROCESSING status but no payment intent or transaction found. Payment may be in an invalid state.';
        return resp;
      }

      // If transaction exists, proceed with normal refund flow below
    }

    // Process refund based on payment method (for COMPLETED or PROCESSING with transactions)
    if (ride.paymentMethod === 'CARD' || ride.paymentMethod === 'GOOGLE_PAY' || ride.paymentMethod === 'APPLE_PAY') {
      const success = await refundCardPaymentToPassenger(ride._id, reason);
      if (!success || !success.success) {
        resp.error = true;
        resp.error_message = success?.error || 'Failed to refund card payment';
        return resp;
      }

      resp.data = success;
      return resp;
    } else if (ride.paymentMethod === 'WALLET') {
      const success = await refundWalletPaymentToPassenger(ride._id, reason);
      if (!success || !success.success) {
        resp.error = true;
        resp.error_message = success?.error || 'Failed to refund wallet payment';
        return resp;
      }

      resp.data = success;
      return resp;
    } else {
      resp.error = true;
      resp.error_message = `Invalid payment method: ${ride.paymentMethod || 'UNKNOWN'}. Only CARD, GOOGLE_PAY, APPLE_PAY, and WALLET payments can be refunded.`;
      return resp;
    }
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    console.error(`API ERROR Stack: ${error.stack}`);
    resp.error = true;
    resp.error_message = error.message || 'Something went wrong';
    return resp;
  }
};
