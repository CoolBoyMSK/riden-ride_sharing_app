import { findPassengerByUserId } from '../../../dal/passenger.js';
import {
  addPassengerPaymentMethod,
  setDefaultCard,
  getPassengerCards,
  deletePassengerCard,
  updatePassengerCard,
  getCardDetails,
  addFundsToWallet,
  getWallet,
} from '../../../dal/stripe.js';
import mongoose from 'mongoose';

export const addPaymentMethod = async (
  user,
  { type, card, billing_details },
  resp,
) => {
  try {
    const passenger = await findPassengerByUserId(user._id);
    if (!passenger) {
      resp.error = true;
      resp.error_message = 'Failed to Fetch passenger';
      return resp;
    }

    const payload = {
      type,
      card,
      billing_details,
    };

    const success = await addPassengerPaymentMethod(passenger, payload);
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to add payment method';
      return resp;
    }

    resp.data = {
      success: true,
    };
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = 'Something went wrong while adding stripe card';
    return resp;
  }
};

export const setDefaultPaymentMethod = async (
  user,
  { paymentMethodId },
  resp,
) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const passenger = await findPassengerByUserId(user._id);
    if (!passenger) {
      resp.error = true;
      resp.error_message = 'Failed to Fetch passenger';
      return resp;
    }

    const success = await setDefaultCard(
      passenger.stripeCustomerId,
      paymentMethodId,
    );
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed set default payment method';
      return resp;
    }

    resp.data = {
      success: true,
    };
    return resp;
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message =
      'Something went wrong while setting default Payment method';
    return resp;
  }
};

export const getPaymentMethods = async (user, resp) => {
  try {
    const passenger = await findPassengerByUserId(user._id);
    if (!passenger) {
      resp.error = true;
      resp.error_message = 'Failed to fetch passenger';
      return resp;
    }

    const success = await getPassengerCards(passenger);
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to fetch payment methods';
      return resp;
    }

    resp.data = success;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = 'Something went wrong while fetching Payment methods';
    return resp;
  }
};

export const getPaymentMethodById = async (user, { paymentMethodId }, resp) => {
  try {
    const passenger = await findPassengerByUserId(user._id);
    if (!passenger) {
      resp.error = true;
      resp.error_message = 'Failed to fetch passenger';
      return resp;
    }

    const success = await getCardDetails(paymentMethodId);
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to fetch payment method';
      return resp;
    }

    resp.data = success;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = 'Something went wrong while fetching Payment methods';
    return resp;
  }
};

export const updatePaymentMethod = async (
  user,
  { paymentMethodId },
  payload,
  resp,
) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const passenger = await findPassengerByUserId(user._id);
    if (!passenger) {
      resp.error = true;
      resp.error_message = 'Failed to fetch passenger';
      return resp;
    }

    const success = await updatePassengerCard(paymentMethodId, payload);
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to fetch passenger';
      return resp;
    }

    await session.commitTransaction();
    session.endSession();

    resp.data = { success: true };
    return resp;
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = 'Something went wrong while updating payment method';
    return resp;
  }
};

export const deletePaymentMethod = async (user, { paymentMethodId }, resp) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const passenger = await findPassengerByUserId(user._id);
    if (!passenger) {
      resp.error = true;
      resp.error_message = 'Failed to fetch passenger';
      return resp;
    }

    const success = await deletePassengerCard(passenger._id, paymentMethodId);
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to delete payment method';
      return resp;
    }

    await session.commitTransaction();
    session.endSession();

    resp.data = {
      success: true,
    };
    return resp;
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message =
      'Something went wrong while deleting the payment method';
    return resp;
  }
};

export const topUpInAppWallet = async (
  user,
  { paymentMethodId },
  { amount },
  resp,
) => {
  try {
    const passenger = await findPassengerByUserId(user._id);
    if (!passenger) {
      resp.error = true;
      resp.error_message = 'Failed to fetch passenger';
      return resp;
    }

    const success = await addFundsToWallet(passenger, amount, paymentMethodId);
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to top-up in-app wallet';
      return resp;
    }

    resp.data = {
      success: success.status === 'succeeded' ? true : false,
    };
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message =
      'Something went wrong while adding funds to in-app wallet';
    return resp;
  }
};

export const getInAppWallet = async (user, resp) => {
  try {
    const passenger = await findPassengerByUserId(user._id);
    if (!passenger) {
      resp.error = true;
      resp.error_message = 'Failed to fetch passenger';
      return resp;
    }

    const success = await getWallet(passenger._id);
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to fetch wallet';
      return resp;
    }

    resp.data = success;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = 'Something went wrong while fetching wallet';
    return resp;
  }
};
