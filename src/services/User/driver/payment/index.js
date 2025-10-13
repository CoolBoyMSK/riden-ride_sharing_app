import { findDriverByUserId } from '../../../../dal/driver.js';
import {
  createDriverStripeAccount,
  addDriverExternalAccount,
  onboardDriverStripeAccount,
  createDriverVerification,
  uploadAdditionalDocument,
  uploadLicenseFront,
  uploadLicenseBack,
  findVerificationStatus,
  checkConnectedAccountStatus,
  getAllExternalAccounts,
  getExternalAccountById,
  updateExternalAccount,
  deleteExternalAccount,
  setDefaultExternalAccount,
  createPayoutRequest,
  payoutToDriverBank,
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
    resp.error_message = error.message || 'Something went wrong';
    return resp;
  }
};

export const onBoardDriver = async (user, { data }, ip, resp) => {
  try {
    const driver = await findDriverByUserId(user._id);
    if (!driver) {
      resp.error = true;
      resp.error_message = 'Failed to fetch driver';
      return resp;
    }

    const success = await onboardDriverStripeAccount(user, driver, data, ip);
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to onboard driver';
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

export const driverIdentityVerification = async (user, resp) => {
  try {
    const driver = await findDriverByUserId(user._id);
    if (!driver) {
      resp.error = true;
      resp.error_message = 'Failed to fetch driver';
      return resp;
    }

    const success = await createDriverVerification(driver);
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to verify driver';
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

export const sendAdditionalDocument = async (user, file, resp) => {
  try {
    const driver = await findDriverByUserId(user._id);
    if (!driver) {
      resp.error = true;
      resp.error_message = 'Failed to fetch driver';
      return resp;
    }

    const success = await uploadAdditionalDocument(
      driver.stripeAccountId,
      file,
    );
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to upload document';
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

export const sendLicenseFront = async (user, file, resp) => {
  try {
    const driver = await findDriverByUserId(user._id);
    if (!driver) {
      resp.error = true;
      resp.error_message = 'Failed to fetch driver';
      return resp;
    }

    const success = await uploadLicenseFront(driver.stripeAccountId, file);
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to upload front of license';
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

export const sendLicenseBack = async (user, file, resp) => {
  try {
    const driver = await findDriverByUserId(user._id);
    if (!driver) {
      resp.error = true;
      resp.error_message = 'Failed to fetch driver';
      return resp;
    }

    const success = await uploadLicenseBack(driver.stripeAccountId, file);
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to upload license back';
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

export const getConnectedAccountStatus = async (user, resp) => {
  try {
    const driver = await findDriverByUserId(user._id);
    if (!driver) {
      resp.error = true;
      resp.error_message = 'Failed to fetch driver';
      return resp;
    }

    const success = await checkConnectedAccountStatus(driver.stripeAccountId);
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to check account status';
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

export const getIdentityVerificationStatus = async (
  user,
  { sessionId },
  resp,
) => {
  try {
    const driver = await findDriverByUserId(user._id);
    if (!driver) {
      resp.error = true;
      resp.error_message = 'Failed to fetch driver';
      return resp;
    }

    const success = await findVerificationStatus(sessionId);
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to fetch driver stripe verification status';
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

export const getDriverStripeAccount = async (user, resp) => {
  try {
    const driver = await findDriverByUserId(user._id);
    if (!driver) {
      resp.error = true;
      resp.error_message = 'Failed to fetch driver';
      return resp;
    }

    const success = await createDriverStripeAccount(user, driver);
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to create driver account';
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
    resp.error_message = error.message || 'Something went wrong';
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
    resp.error_message = error.message || 'Something went wrong';
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
    resp.error_message = error.message || 'Something went wrong';
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

    const success = await deleteExternalAccount(
      driver,
      driver.stripeAccountId,
      id,
    );
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
    resp.error_message = error.message || 'Something went wrong';
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
    resp.error_message = error.message || 'Something went wrong';
    return resp;
  }
};

export const sendInstantPayoutRequest = async (user, resp) => {
  try {
    const driver = await findDriverByUserId(user._id);
    if (!driver) {
      resp.error = true;
      resp.error_message = 'Failed to fetch driver';
      return resp;
    }

    const success = await createPayoutRequest(driver._id);
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to send payout request';
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

export const sendPayoutToDriverBank = async (user, { amount }, resp) => {
  try {
    const driver = await findDriverByUserId(user._id);
    if (!driver) {
      resp.error = true;
      resp.error_message = 'Failed to fetch driver';
      return resp;
    }

    const success = await payoutToDriverBank(driver, amount);
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to send payout to bank';
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
