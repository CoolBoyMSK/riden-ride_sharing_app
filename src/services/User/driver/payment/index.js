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
  deleteExternalAccount,
  setDefaultExternalAccount,
  createPayoutRequest,
  payoutToDriverBank,
  processInstantPayoutWithFee,
  getDriverBalance,
  getDriverUnpaidBalance,
} from '../../../../dal/stripe.js';

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

export const addPayoutMethod = async (user, { bankDetails }, resp) => {
  try {
    const driver = await findDriverByUserId(user._id);
    if (!driver) {
      resp.error = true;
      resp.error_message = 'Failed to fetch driver';
      return resp;
    }

    const result = await addDriverExternalAccount(driver, bankDetails);
    if (!result.success) {
      resp.error = true;
      resp.error_message = 'Failed to add payout method';
      return resp;
    }

    resp.data = result;
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

    const result = await getAllExternalAccounts(driver.stripeAccountId);
    if (!result.success) {
      resp.error = true;
      resp.error_message = 'Failed to fetch payout methods';
      return resp;
    }

    resp.data = result;
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

    const result = await getExternalAccountById(driver.stripeAccountId, id);
    if (!result.success) {
      resp.error = true;
      resp.error_message = 'Failed to fetch payout method';
      return resp;
    }

    resp.data = result;
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

    const result = await deleteExternalAccount(driver.stripeAccountId, id);
    if (!result.success) {
      resp.error = true;
      resp.error_message = 'Failed to delete payout method';
      return resp;
    }

    resp.data = result;
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

    const result = await setDefaultExternalAccount(driver.stripeAccountId, id);
    if (!result.success) {
      resp.error = true;
      resp.error_message = 'Failed to set default payout method';
      return resp;
    }

    resp.data = result;
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

// Instant payout with 3% fee using driver's available balance
export const instantPayoutWithFee = async (user, resp) => {
  try {
    const driver = await findDriverByUserId(user._id);
    if (!driver) {
      resp.error = true;
      resp.error_message = 'Failed to fetch driver';
      return resp;
    }

    const FEE_PERCENT = 3;

    // 1) Try using available wallet balance
    const wallet = await getDriverBalance(driver._id);
    const availableBalance = Number(wallet?.availableBalance || 0);

    let grossAmountToUse = null;
    let source = null;

    if (!isNaN(availableBalance) && availableBalance >= 10) {
      // Sufficient wallet balance → use it directly
      grossAmountToUse = availableBalance;
      source = 'wallet';
    } else {
      // 2) Fallback: use unpaid ride earnings (all-time unpaid, close enough to current week)
      const unpaid = await getDriverUnpaidBalance(driver._id);
      const unpaidBalance = Number(unpaid?.unpaidBalance || 0);

      if (isNaN(unpaidBalance) || unpaidBalance < 10) {
        resp.error = true;
        resp.error_message =
          'No available balance for instant payout (min $10 required)';
        return resp;
      }

      grossAmountToUse = unpaidBalance;
      source = 'unpaidEarnings';
    }

    const result = await processInstantPayoutWithFee(
      driver,
      FEE_PERCENT,
      grossAmountToUse,
    );

    if (!result?.success) {
      resp.error = true;
      resp.error_message =
        result?.error || 'Failed to process instant payout with fee';
      return resp;
    }

    resp.data = {
      ...result,
      source, // 'wallet' or 'unpaidEarnings'
    };
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'Something went wrong';
    return resp;
  }
};
