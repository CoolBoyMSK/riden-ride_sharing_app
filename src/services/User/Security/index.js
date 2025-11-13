import {
  findUserById,
  findRecovertNumbersbyUserId,
  addRecoveryNumber,
  deleteRecoveryNumber,
  updateRecoveryPhoneNumber,
  // getPasskeyRegisterOptions,
  // verifyPasskeyRegistration,
  // update2FAStatus,
  findDeviceInfo,
  createBiometric,
  enableBiometric,
} from '../../../dal/user/index.js';

export const createRecoveryNumber = async (user, { phoneNumber }, resp) => {
  try {
    const isUser = await findUserById(user.id);
    if (!isUser) {
      resp.error = true;
      resp.error_message = 'Failed to fetch user';
      return resp;
    }

    const success = await addRecoveryNumber(isUser.userId._id, phoneNumber);
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
    resp.error_message = error.message || 'something went wrong';
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

    const recoveryNumbers = await findRecovertNumbersbyUserId(
      isUser.userId._id,
    );
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
    resp.error_message = error.message || 'something went wrong';
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
      isUser.userId._id,
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
    resp.error_message = error.message || 'something went wrong';
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

    const deleted = await deleteRecoveryNumber(isUser.userId._id, numberId);
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
    resp.error_message = error.message || 'something went wrong';
    return resp;
  }
};

export const addBiometric = async (user, data, resp) => {
  try {
    const success = await createBiometric({ userId: user._id, ...data });
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to add biometric';
      return resp;
    }

    resp.data = { success: true };
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'something went wrong';
    return resp;
  }
};

export const toggleBiometric = async (user, resp) => {
  try {
    const data = await enableBiometric(user._id);
    if (!data.success) {
      resp.error = true;
      resp.error_message = 'Failed to toggle biometric';
      return resp;
    }

    resp.data = data;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'something went wrong';
    return resp;
  }
};

// export const fetchPasskeyRegisterOptions = async (user, resp) => {
//   try {
//     const isUser = await findUserById(user.id);
//     if (!isUser) {
//       resp.error = true;
//       resp.error_message = 'Failed to fetch user';
//       return resp;
//     }

//     const success = await getPasskeyRegisterOptions(isUser.userId._id);
//     if (!success) {
//       resp.error = true;
//       resp.error_message = 'Failed to register passkey';
//       return resp;
//     }

//     resp.data = success;
//     return resp;
//   } catch (error) {
//     console.error(`API ERROR: ${error}`);
//     resp.error = true;
//     resp.error_message = error.message || 'something went wrong';
//     return resp;
//   }
// };

// export const verifyAndSavePasskeyInDb = async (user, { payload }, resp) => {
//   try {
//     const isUser = await findUserById(user.id);
//     if (!isUser) {
//       resp.error = true;
//       resp.error_message = 'Failed to fetch user';
//       return resp;
//     }

//     const success = await verifyPasskeyRegistration(isUser.userId._id, payload);
//     if (!success) {
//       resp.error = true;
//       resp.error_message = 'Failed to save passkeys';
//       return resp;
//     }

//     resp.data = { message: 'Passkey registered' };
//     return resp;
//   } catch (error) {
//     console.error(`API ERROR: ${error}`);
//     resp.error = true;
//     resp.error_message = error.message || 'something went wrong';
//     return resp;
//   }
// };

// export const toggle2FAStatus = async (user, resp) => {
//   try {
//     const isUser = await findUserById(user.id);
//     if (!isUser) {
//       resp.error = true;
//       resp.error_message = 'Failed to fetch user';
//       return resp;
//     }

//     const success = await update2FAStatus(isUser.userId._id);
//     if (!success) {
//       resp.error = true;
//       resp.error_message = 'Failed to save passkeys';
//       return resp;
//     }

//     resp.data = success;
//     return resp;
//   } catch (error) {
//     console.error(`API ERROR: ${error}`);
//     resp.error = true;
//     resp.error_message = error.message || 'something went wrong';
//     return resp;
//   }
// };

export const getUserDevices = async (user, resp) => {
  try {
    const success = await findDeviceInfo(user._id);
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to fetch Device info';
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
