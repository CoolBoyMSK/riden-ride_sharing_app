import { findDriverByUserId } from '../../../../dal/driver.js';
import { addDriverBankAccount } from '../../../../dal/stripe.js';

export const addPayoutMethod = async (user, { bankDetails }, resp) => {
  try {
    const driver = await findDriverByUserId(user._id);
    if (!driver) {
      resp.error = true;
      resp.error_message = 'Failed to fetch driver';
      return resp;
    }

    const success = await addDriverBankAccount(driver, bankDetails);
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

    const success = await addDriverBankAccount(driver, bankDetails);
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
