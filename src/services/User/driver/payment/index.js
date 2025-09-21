import { findDriverByUserId } from '../../../../dal/driver.js';
import {
  addDriverExternalAccount,
  getAllExternalAccounts,
  getExternalAccountById,
  updateExternalAccount,
  deleteExternalAccount,
  setDefaultExternalAccount,
} from '../../../../dal/stripe.js';

export const addPayoutMethod = async (user, { bankDetails }, resp) => {
  try {
    const driver = await findDriverByUserId(user._id);
    if (!driver) {
      resp.error = true;
      resp.error_message = 'Failed to fetch driver';
      return resp;
    }

    const success = await addDriverExternalAccount(driver, bankDetails);
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to add payout method';
      return resp;
    }

    resp.data = success;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = 'Something went wrong while adding payout method';
    return resp;
  }
};

export const getAllPayoutMethods = async (user, resp) => {
  try {
    const driver = await findDriverByUserId(user._id);
    if (!driver) {
      resp.error = true;
      resp.error_message = 'Failed to fetch driver';
      return resp;
    }

    const success = await getAllExternalAccounts(driver.stripeAccountId);
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to fetch payout methods';
      return resp;
    }

    resp.data = success.data;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = 'Something went wrong while fetching payout methods';
    return resp;
  }
};

export const getPayoutMethodById = async (user, { id }, resp) => {
  try {
    const driver = await findDriverByUserId(user._id);
    if (!driver) {
      resp.error = true;
      resp.error_message = 'Failed to fetch driver';
      return resp;
    }

    const success = await getExternalAccountById(driver.stripeAccountId, id);
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to fetch payout method';
      return resp;
    }

    resp.data = success;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = 'Something went wrong while fetching payout method';
    return resp;
  }
};

export const updatePayoutMethod = async (user, { id }, { payload }, resp) => {
  try {
    const driver = await findDriverByUserId(user._id);
    if (!driver) {
      resp.error = true;
      resp.error_message = 'Failed to fetch driver';
      return resp;
    }

    const success = await updateExternalAccount(
      driver.stripeAccountId,
      id,
      payload,
    );
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to update payout method';
      return resp;
    }

    resp.data = success;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = 'Something went wrong while updating payout method';
    return resp;
  }
};

export const deletePayoutMethod = async (user, { id }, resp) => {
  try {
    const driver = await findDriverByUserId(user._id);
    if (!driver) {
      resp.error = true;
      resp.error_message = 'Failed to fetch driver';
      return resp;
    }

    const success = await deleteExternalAccount(driver.stripeAccountId, id);
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to delete payout method';
      return resp;
    }

    resp.data = success;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = 'Something went wrong while deleting payout method';
    return resp;
  }
};

export const setDefaultPayoutMethod = async (user, { id }, resp) => {
  try {
    const driver = await findDriverByUserId(user._id);
    if (!driver) {
      resp.error = true;
      resp.error_message = 'Failed to fetch driver';
      return resp;
    }

    const success = await setDefaultExternalAccount(driver.stripeAccountId, id);
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to set default payout method';
      return resp;
    }

    resp.data = success;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message =
      'Something went wrong while setting default payout method';
    return resp;
  }
};
