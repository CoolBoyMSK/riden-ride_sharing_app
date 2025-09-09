import {
  findPassenger,
  updatePassenger,
  findPassengerByUserId,
} from '../../../dal/passenger.js';
import mongoose from 'mongoose';

export const addPaymentMethod = async (
  user,
  { type, isDefault, card },
  resp,
) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const normalizedCardNumber = card.cardNumber.replace(/\s+/g, '');
    const existingPassenger = await findPassenger(
      {
        userId: user.id,
        'paymentMethods.card.cardNumber': normalizedCardNumber,
      },
      { 'paymentMethods.$': 1 },
      { session },
    );

    if (existingPassenger) {
      resp.error = true;
      resp.error_message = 'This card is already added';
      return resp;
    }

    if (isDefault) {
      await updatePassenger(
        { userId: user.id, 'paymentMethods.isDefault': true },
        { $set: { 'paymentMethods.$[elem].isDefault': false } },
        {
          arrayFilters: [{ 'elem.isDefault': true }],
          multi: true,
          session,
        },
      );
    }

    const payload = { type, isDefault, card };

    const passenger = await updatePassenger(
      { userId: user.id },
      { $push: { paymentMethods: payload } },
      { new: true, session },
    );

    if (!passenger) {
      resp.error = true;
      resp.error_message = 'Failed to Update the passenger';
      return resp;
    }

    await session.commitTransaction();
    session.endSession();

    resp.data = { paymentMethods: passenger.paymentMethods };
    return resp;
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = 'Something went wrong while adding payment method';
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
    await updatePassenger(
      { userId: user.id },
      { $set: { 'paymentMethods.$[].isDefault': false } },
      { new: true, session },
    );

    const payload = { $set: { 'paymentMethods.$.isDefault': true } };
    const passenger = await updatePassenger(
      { userId: user.id, 'paymentMethods._id': paymentMethodId },
      payload,
      { new: true, session },
    );

    if (!passenger) {
      resp.error = true;
      resp.error_message = 'Payment method not found or failed to set default';
      return resp;
    }

    // Commit transaction
    await session.commitTransaction();
    session.endSession();

    resp.data = { paymentMethods: passenger.paymentMethods };
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
    const passenger = await findPassengerByUserId(user.id);

    if (!passenger) {
      resp.error = true;
      resp.error_message = 'Failed to fetch payment methods';
      return resp;
    }

    resp.data = { paymentMethods: passenger.paymentMethods };
    return resp;
  } catch (error) {
    conosle.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = 'Something went wrong while fetching Payment methods';
    return resp;
  }
};

export const updatePaymentMethod = async (
  user,
  { card, paymentMethodId },
  resp,
) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const passenger = await updatePassenger(
      { userId: user.id, 'paymentMethods._id': paymentMethodId },
      { $set: { 'paymentMethods.$.card': card } },
      { session },
    );

    if (!passenger) {
      resp.error = true;
      resp.error_message = 'Failed to update Payment Method';
      return resp;
    }

    await session.commitTransaction();
    session.endSession();

    resp.data = { paymentMethods: passenger.paymentMethods };
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
    const passenger = await findPassenger(
      { userId: user.id, 'paymentMethods._id': paymentMethodId },
      { 'paymentMethods.$': 1 },
      { session },
    );

    if (!passenger) {
      resp.error = true;
      resp.error_message = 'Payment method not found';
      return resp;
    }

    const methodToDelete = passenger.paymentMethods[0];
    const isDefault = methodToDelete?.isDefault;

    let updatedPassenger = await updatePassenger(
      { userId: user.id },
      { $pull: { paymentMethods: { _id: paymentMethodId } } },
      { session },
    );

    if (isDefault) {
      updatedPassenger = await updatePassenger(
        { userId: user.id, 'paymentMethods.0': { $exists: true } },
        { $set: { 'paymentMethods.0.isDefault': true } },
        { new: true, session },
      );
    }

    await session.commitTransaction();
    session.endSession();

    resp.data = { paymentMethods: passenger.paymentMethods };
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
