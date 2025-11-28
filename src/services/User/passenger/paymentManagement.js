import mongoose from 'mongoose';
import {
  findPassengerByUserId,
  findPassengerTransactions,
} from '../../../dal/passenger.js';
import {
  cardSetupIntent,
  addPassengerCard,
  setDefaultPassengerCard,
  getPassengerCards,
  deletePassengerCard,
  getPassengerCardById,
  addFundsToWallet,
  getPassengerWallet,
  setupPassengerWalletIntent,
  deletePassengerWallet,
  createPassengerStripeCustomer,
  getPassengerPaymentIntent,
} from '../../../dal/stripe.js';
import { CARD_TYPES } from '../../../enums/paymentEnums.js';

export const addCardSetupIntent = async (user, resp) => {
  try {
    const passenger = await findPassengerByUserId(user._id);
    if (!passenger) {
      resp.error = true;
      resp.error_message = 'Failed to fetch passenger';
      return resp;
    }

    const success = await cardSetupIntent(passenger.stripeCustomerId);
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to create setup intent';
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

export const addCard = async (user, { paymentMethodId, cardType }, resp) => {
  try {
    if (!paymentMethodId) {
      resp.error = true;
      resp.error_message = 'Payment method id is required';
      return resp;
    } else if (!CARD_TYPES.includes(cardType)) {
      resp.error = true;
      resp.error_message = 'Invalid card type';
      return resp;
    }

    const passenger = await findPassengerByUserId(user._id);
    if (!passenger) {
      resp.error = true;
      resp.error_message = 'Failed to Fetch passenger';
      return resp;
    }

    // Ensure passenger has Stripe customer ID
    if (!passenger.stripeCustomerId) {
      await createPassengerStripeCustomer(user, passenger);
      // Reload passenger to get updated stripeCustomerId
      const updatedPassenger = await findPassengerByUserId(user._id);
      if (updatedPassenger && updatedPassenger.stripeCustomerId) {
        passenger.stripeCustomerId = updatedPassenger.stripeCustomerId;
      }
    }

    // Prepare metadata for payment method
    const metadata = {
      passengerId: passenger._id.toString(),
      userId: user._id.toString(),
      userType: 'passenger',
      addedAt: new Date().toISOString(),
      isWallet: false,
      cardType,
    };

    // Add card to Stripe and database
    const result = await addPassengerCard(
      passenger.stripeCustomerId,
      paymentMethodId,
      metadata,
    );
    if (!result.success) {
      resp.error = true;
      resp.error_message = result.error || 'Failed to add payment method';
      return resp;
    }

    resp.data = result;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'something went wrong';
    return resp;
  }
};

export const getCards = async (user, resp) => {
  try {
    const passenger = await findPassengerByUserId(user._id);
    if (!passenger) {
      resp.error = true;
      resp.error_message = 'Failed to fetch passenger';
      return resp;
    }

    const success = await getPassengerCards(passenger.stripeCustomerId);
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
    resp.error_message = error.message || 'something went wrong';
    return resp;
  }
};

export const getCardById = async (user, { paymentMethodId }, resp) => {
  try {
    const passenger = await findPassengerByUserId(user._id);
    if (!passenger) {
      resp.error = true;
      resp.error_message = 'Failed to fetch passenger';
      return resp;
    }

    if (!passenger.stripeCustomerId) {
      resp.error = true;
      resp.error_message = 'Passenger does not have a Stripe customer ID';
      return resp;
    }

    const result = await getPassengerCardById(
      passenger.stripeCustomerId,
      paymentMethodId,
    );
    if (!result.success) {
      resp.error = true;
      resp.error_message = result.error || 'Failed to fetch card by id';
      return resp;
    }

    resp.data = result;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'something went wrong';
    return resp;
  }
};

export const deleteCard = async (user, { paymentMethodId }, resp) => {
  try {
    const passenger = await findPassengerByUserId(user._id);
    if (!passenger) {
      resp.error = true;
      resp.error_message = 'Failed to fetch passenger';
      return resp;
    }

    if (!passenger.stripeCustomerId) {
      resp.error = true;
      resp.error_message = 'Passenger does not have a Stripe customer ID';
      return resp;
    }

    const result = await deletePassengerCard(
      passenger.stripeCustomerId,
      paymentMethodId,
    );
    if (!result.success) {
      resp.error = true;
      resp.error_message = result.error || 'Failed to delete payment method';
      return resp;
    }

    resp.data = result;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'something went wrong';
    return resp;
  }
};

export const setDefaultCard = async (user, { paymentMethodId }, resp) => {
  try {
    const passenger = await findPassengerByUserId(user._id);
    if (!passenger) {
      resp.error = true;
      resp.error_message = 'Failed to Fetch passenger';
      return resp;
    }

    const result = await setDefaultPassengerCard(
      passenger.stripeCustomerId,
      paymentMethodId,
    );
    if (!result.success) {
      resp.error = true;
      resp.error_message = result.error || 'Failed set default payment method';
      return resp;
    }

    resp.data = result;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'something went wrong';
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

    const success = await addFundsToWallet(
      passenger,
      amount,
      paymentMethodId,
      'TOP-UP',
    );
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to top-up in-app wallet';
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

export const getInAppWallet = async (user, resp) => {
  try {
    const passenger = await findPassengerByUserId(user._id);
    if (!passenger) {
      resp.error = true;
      resp.error_message = 'Failed to fetch passenger';
      return resp;
    }

    const success = await getPassengerWallet(passenger._id);
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
    resp.error_message = error.message || 'something went wrong';
    return resp;
  }
};

export const getTransactions = async (user, { page, limit }, resp) => {
  try {
    const passenger = await findPassengerByUserId(user._id);
    if (!passenger) {
      resp.error = true;
      resp.error_message = 'Failed to fetch passenger';
      return resp;
    }

    const success = await findPassengerTransactions(passenger._id, page, limit);
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to fetch transactions';
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

export const createWalletSetupIntent = async (user, { walletType }, resp) => {
  try {
    const passenger = await findPassengerByUserId(user._id);
    if (!passenger) {
      resp.error = true;
      resp.error_message = 'Failed to fetch passenger';
      return resp;
    }

    const result = await setupPassengerWalletIntent(
      user,
      passenger,
      walletType,
    );
    if (!result.success) {
      resp.error = true;
      resp.error_message =
        result.error || 'Failed to setup passenger wallet intent';
      return resp;
    }

    resp.data = result;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'something went wrong';
    return resp;
  }
};

export const deleteWallet = async (user, { walletType }, resp) => {
  try {
    const passenger = await findPassengerByUserId(user._id);
    if (!passenger) {
      resp.error = true;
      resp.error_message = 'Failed to fetch passenger';
      return resp;
    }

    const result = await deletePassengerWallet(passenger, walletType);

    if (!result.success) {
      resp.error = true;
      resp.error_message = result.error || 'Failed to delete wallet';
      return resp;
    }

    resp.data = {
      success: true,
      message: result.message,
    };
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'something went wrong';
    return resp;
  }
};

export const getPaymentIntent = async ({ id }, resp) => {
  try {
    // const passenger = await findPassengerByUserId(user._id);
    // if (!passenger) {
    //   resp.error = true;
    //   resp.error_message = 'Failed to fetch passenger';
    //   return resp;
    // }

    // if (!passenger.stripeCustomerId) {
    //   resp.error = true;
    //   resp.error_message = 'Passenger does not have a Stripe customer ID';
    //   return resp;
    // }

    if (!id) {
      resp.error = true;
      resp.error_message = 'Payment intent ID is required';
      return resp;
    }

    const result = await getPassengerPaymentIntent(
      // passenger.stripeCustomerId,
      id,
    );
    if (!result.success) {
      resp.error = true;
      resp.error_message = result.error || 'Failed to fetch payment intent';
      return resp;
    }

    resp.data = result;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'something went wrong';
    return resp;
  }
};
