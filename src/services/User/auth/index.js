import {
  hashPassword,
  comparePasswords,
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from '../../../utils/auth.js';
import {
  findUserByEmail,
  findUserByPhone,
  createUser,
  updateUserById,
} from '../../../dal/user/index.js';
import {
  createPassengerProfile,
  findPassengerByUserId,
} from '../../../dal/passenger.js';
import {
  createDriverProfile,
  findDriverByUserId,
} from '../../../dal/driver.js';

export const signupUser = async (
  { name, email, phoneNumber, password, type },
  resp,
) => {
  if (await findUserByEmail(email)) {
    resp.error = true;
    resp.error_message = 'Email already in use';
    return resp;
  }
  if (await findUserByPhone(phoneNumber)) {
    resp.error = true;
    resp.error_message = 'Phone number already in use';
    return resp;
  }

  const hashed = await hashPassword(password);
  const roles = type?.includes('driver') ? ['driver'] : ['passenger'];
  const user = await createUser({
    name,
    email,
    phoneNumber,
    password: hashed,
    roles,
  });

  const userObj = user.toObject();
  delete userObj.password;
  resp.data = userObj;
  return resp;
};

export const resetUserPassword = async (newPassword, firebasePhone, resp) => {
  const user = await findUserByPhone(firebasePhone);
  if (!user) {
    resp.error = true;
    resp.error_message = 'No user found for that phone number';
    return resp;
  }
  const hashed = await hashPassword(newPassword);
  await updateUserById(user._id, { password: hashed });
  resp.data = {};
  return resp;
};

export const loginUser = async ({ email, password }, resp) => {
  const user = await findUserByEmail(email);
  if (!user) {
    resp.error = true;
    resp.error_message = 'Invalid credentials';
    return resp;
  }

  const match = await comparePasswords(password, user.password);
  if (!match) {
    resp.error = true;
    resp.error_message = 'Invalid credentials';
    return resp;
  }

  const userId = user._id.toString();

  if (user.roles.includes('passenger')) {
    const passenger = await findPassengerByUserId(userId);
    if (!passenger) {
      await createPassengerProfile(userId);
    }
  }

  if (user.roles.includes('driver')) {
    const driver = await findDriverByUserId(userId);
    if (!driver) {
      await createDriverProfile(userId);
    }
  }

  const payload = { id: userId, roles: user.roles };
  resp.data = {
    accessToken: generateAccessToken(payload),
    refreshToken: generateRefreshToken(payload),
  };

  return resp;
};

export const refreshTokens = async ({ refreshToken }, resp) => {
  const payload = verifyRefreshToken(refreshToken);
  if (!payload) {
    resp.error = true;
    resp.error_message = 'Invalid refresh token';
    return resp;
  }
  resp.data = {
    accessToken: generateAccessToken({ id: payload.id, roles: payload.roles }),
    refreshToken: generateRefreshToken({
      id: payload.id,
      roles: payload.roles,
    }),
  };
  return resp;
};
