import {
  findUserById,
  findRecovertNumbersbyUserId,
  addRecoveryNumber,
  deleteRecoveryNumber,
  updateRecoveryPhoneNumber,
  getPasskeyRegisterOptions,
  verifyPasskeyRegistration,
  update2FAStatus,
} from '../../../dal/user/index.js';

export const createRecoveryNumber = async (user, { phoneNumber }, resp) => {
  try {
    const isUser = await findUserById(user.id);
    if (!isUser) {
      resp.error = true;
      resp.error_message = 'Failed to fetch user';
      return resp;
    }

    const success = await addRecoveryNumber(isUser._id, phoneNumber);
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to add recovery phone number';
      return resp;
    }

    resp.data = success;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message =
      'Something went wrong while adding recovery phone number';
    return resp;
  }
};

export const getRecoveryNumbers = async (user, resp) => {
  try {
    const isUser = await findUserById(user.id);
    if (!isUser) {
      resp.error = true;
      resp.error_message = 'Failed to fetch user';
      return resp;
    }

    const recoveryNumbers = await findRecovertNumbersbyUserId(isUser._id);
    if (!recoveryNumbers) {
      resp.error = true;
      resp.error_message = 'Failed to fetch recovery phone numbers';
      return resp;
    }

    resp.data = recoveryNumbers;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message =
      'Something went wrong while fetching recovery phone numbers';
    return resp;
  }
};

export const editRecoveryNumber = async (
  user,
  { numberId },
  { phoneNumber },
  resp,
) => {
  try {
    const isUser = await findUserById(user.id);
    if (!isUser) {
      resp.error = true;
      resp.error_message = 'Failed to fetch user';
      return resp;
    }

    const updated = await updateRecoveryPhoneNumber(
      isUser._id,
      numberId,
      phoneNumber,
    );
    if (!updated) {
      resp.error = true;
      resp.error_message = 'Failed to update recovery phone number';
      return resp;
    }

    resp.data = updated;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message =
      'Something went wrong while updating recovery phone number';
    return resp;
  }
};

export const removeRecoveryNumber = async (user, { numberId }, resp) => {
  try {
    const isUser = await findUserById(user.id);
    if (!isUser) {
      resp.error = true;
      resp.error_message = 'Failed to fetch user';
      return resp;
    }

    const deleted = await deleteRecoveryNumber(isUser._id, numberId);
    if (!deleted) {
      resp.error = true;
      resp.error_message = 'Failed to delete recovery phone number';
      return resp;
    }

    resp.data = deleted;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message =
      'Something went wrong while deleting recovery phone number';
    return resp;
  }
};

export const fetchPasskeyRegisterOptions = async (user, resp) => {
  try {
    const isUser = await findUserById(user.id);
    if (!isUser) {
      resp.error = true;
      resp.error_message = 'Failed to fetch user';
      return resp;
    }

    const success = await getPasskeyRegisterOptions(isUser._id);
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to register passkey';
      return resp;
    }

    resp.data = success;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message =
      'Something went wrong while registering passkey options';
    return resp;
  }
};

export const verifyAndSavePasskeyInDb = async (user, { payload }, resp) => {
  try {
    const isUser = await findUserById(user.id);
    if (!isUser) {
      resp.error = true;
      resp.error_message = 'Failed to fetch user';
      return resp;
    }

    const success = await verifyPasskeyRegistration(isUser._id, payload);
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to save passkeys';
      return resp;
    }

    resp.data = { message: 'Passkey registered' };
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = 'Something went wrong while registering passkey';
    return resp;
  }
};

export const toggle2FAStatus = async (user, resp) => {
  try {
    const isUser = await findUserById(user.id);
    if (!isUser) {
      resp.error = true;
      resp.error_message = 'Failed to fetch user';
      return resp;
    }

    const success = await update2FAStatus(isUser._id);
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to save passkeys';
      return resp;
    }

    resp.data = success;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = 'Something went wrong while toggling 2FA';
    return resp;
  }
};
