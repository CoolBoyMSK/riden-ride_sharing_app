import {
  hashPassword,
  comparePasswords,
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  generateUniqueId,
} from '../../../utils/auth.js';
import {
  findUserByEmail,
  findUserByPhone,
  createUser,
  updateUserById,
  findUserById,
} from '../../../dal/user/index.js';
import {
  createPassengerProfile,
  findPassengerByUserId,
  updatePassenger,
} from '../../../dal/passenger.js';
import {
  createDriverProfile,
  findDriverByUserId,
  updateDriverByUserId,
} from '../../../dal/driver.js';
import {
  createPassengerStripeCustomer,
  createDriverStripeAccount,
  createPassengerWallet,
  createPayout,
} from '../../../dal/stripe.js';
import { createAdminNotification } from '../../../dal/notification.js';
import { createDeviceInfo } from '../../../dal/user/index.js';
// import { otpQueue } from '../../../queues/otpQueue.js';
import { verifyOtp, sendOtp } from '../../../utils/otpUtils.js';
import {
  getPasskeyLoginOptions,
  verifyPasskeyLogin,
} from '../../../utils/auth.js';
import { extractDeviceInfo } from '../../../utils/deviceInfo.js';
import env from '../../../config/envConfig.js';

export const signupUser = async (
  users,
  { name, email, phoneNumber, gender, password, type },
  resp,
) => {
  let user;
  if (users) {
    user = await findUserById(users.id);
  }

  console.log(user);
  const hashed = await hashPassword(password);

  if (users && users.roles.includes('driver')) {
    let isEmail = await findUserByEmail(email);
    console.log(isEmail);
    if (isEmail) {
      if (isEmail._id.toString() !== user.userId._id.toString()) {
        resp.error = true;
        resp.error_message = 'Email already in use';
        return resp;
      }
    }

    user = await updateUserById(
      { _id: user.userId._id },
      {
        email,
        name,
        password: hashed,
        isPhoneVerified: true,
        isEmailVerified: true,
        isCompleted: true,
      },
    );

    let driverProfile = await findDriverByUserId(user._id);
    if (!driverProfile) {
      const uniqueId = generateUniqueId(user.roles[0], user._id);
      driverProfile = await createDriverProfile(user._id, uniqueId);
    }

    const stripeAccountId = await createDriverStripeAccount(
      user,
      driverProfile,
    );
    if (!stripeAccountId) {
      resp.error = true;
      resp.error_message = 'Failed to create stripe Account Id';
      return resp;
    }

    const notify = await createAdminNotification({
      title: 'New Driver Registered',
      message: `${user.name} registered as drive successfully, Their Phone No: ${user.phoneNumber} and Email: ${user.email}`,
      metadata: user,
      module: 'passenger_management',
      type: 'ALERT',
      actionLink: `${env.FRONTEND_URL}/api/admin/passengers/fetch/${driverProfile._id}`,
    });
    if (!notify) {
      resp.error = true;
      resp.error_message = 'Failed to send notification';
      return resp;
    }

    const userObj = user.toObject();
    delete userObj.password;
    resp.data = userObj;
    return resp;
  }

  if (type && type.includes('passenger')) {
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

    user = await createUser({
      name,
      email,
      phoneNumber,
      gender,
      password: hashed,
      isPhoneVerified: true,
      isEmailVerified: true,
      isCompleted: true,
    });

    let passengerProfile = await findPassengerByUserId(user._id);
    if (!passengerProfile) {
      const uniqueId = generateUniqueId(user.roles[0], user._id);
      passengerProfile = await createPassengerProfile(user._id, uniqueId);
    }

    const stripeCustomerId = await createPassengerStripeCustomer(
      user,
      passengerProfile,
    );
    if (!stripeCustomerId) {
      resp.error = true;
      resp.error_message = 'Failed to create stripe customer account';
      return resp;
    }

    const wallet = await createPassengerWallet(passengerProfile._id);
    if (!wallet) {
      resp.error = true;
      resp.error_message = 'Failed to create In-App wallet';
      return resp;
    }

    const notify = await createAdminNotification({
      title: 'New Passenger Registered',
      message: `${user.name} registered as passenger successfully, Their Phone No: ${user.phoneNumber} and Email: ${user.email}`,
      metadata: user,
      module: 'passenger_management',
      type: 'ALERT',
      actionLink: `${env.FRONTEND_URL}/api/admin/passengers/fetch-passenger/${passengerProfile._id}`,
    });
    if (!notify) {
      resp.error = true;
      resp.error_message = 'Failed to send notification';
      return resp;
    }

    const userObj = user.toObject();
    delete userObj.password;
    resp.data = userObj;
    return resp;
  }

  resp.error = true;
  resp.error_message = 'Invalid User role';
  return resp;
};

export const loginUser = async (
  {
    email,
    phoneNumber,
    password,
    role,
    userDeviceType,
    deviceId,
    deviceModel,
    deviceVendor,
    os,
  },
  headers,
  resp,
) => {
  try {
    // --- Passenger Flow ---
    if (role === 'passenger') {
      let user;

      if (email) {
        user = await findUserByEmail(email);

        if (user && !user.isEmailVerified) {
          // const code = 12345;
          // await sendEmailVerificationOtp(email, code, user.name);
        }
      } else if (phoneNumber) {
        user = await findUserByPhone(phoneNumber);

        if (user && !user.isPhoneVerified) {
          const sent = await sendOtp(phoneNumber);
          if (!sent.success) {
            resp.error = true;
            resp.error_message = 'Failed to send otp';
            return resp;
          }
          resp.data = { otpSent: true, flow: 'verify-phone' };
          return resp;
        }
      }

      if (!user) {
        resp.error = true;
        resp.error_message = 'Invalid credentials';
        return resp;
      }

      // Check password
      const match = await comparePasswords(password, user.password);
      if (!match) {
        resp.error = true;
        resp.error_message = 'Invalid credentials';
        return resp;
      }

      const userId = user._id.toString();

      // Ensure passenger profile exists
      let passenger = await findPassengerByUserId(userId);
      if (!passenger) {
        passenger = await createPassengerProfile(userId);
      }

      const success = await updatePassenger({ userId }, { isActive: true });
      if (!success) {
        resp.error = true;
        resp.error_message = 'Failed to activate passenger';
        return resp;
      }

      user = await updateUserById(user._id, {
        userDeviceToken,
        userDeviceType,
      });
      if (!user) {
        resp.error = true;
        resp.error_message = 'Failed to update Device Token and Type';
        return resp;
      }

      // ✅ If phone already verified → issue tokens
      const payload = { id: userId, roles: user.roles };
      resp.data = {
        user: user,
        accessToken: generateAccessToken(payload),
        refreshToken: generateRefreshToken(payload),
        flow: 'login',
      };
      return resp;
    }

    // --- Driver Flow ---
    if (role === 'driver') {
      if (!phoneNumber && !email) {
        resp.error = true;
        resp.error_message =
          'Phone number or email is required for driver login';
        return resp;
      }

      if (phoneNumber) {
        let user = await findUserByPhone(phoneNumber);
        if (user && user.isPhoneVerified) {
          const payload = { id: user._id, roles: user.roles };
          const success = await updateDriverByUserId(user._id, {
            isActive: true,
          });
          if (!success) {
            resp.error = true;
            resp.error_message = 'Failed to activate driver';
            return resp;
          }

          user = await updateUserById(user._id, {
            userDeviceType,
          });
          if (!user) {
            resp.error = true;
            resp.error_message = 'Failed to update Device Type';
            return resp;
          }

          const driverPayload = { status: success.status };
          if (success.status === 'offline') driverPayload.status = 'online';

          console.log(driverPayload);

          await updateDriverByUserId(user._id, {
            driverPayload,
          });

          // const match = await comparePasswords(password, user.password);
          // if (!match) {
          //   resp.error = true;
          //   resp.error_message = 'Incorrect password';
          //   return resp;
          // }

          const deviceInfo = await extractDeviceInfo(headers);
          const device = {
            userId: user._id,
            deviceId,
            deviceType: userDeviceType,
            deviceModel,
            deviceVendor,
            os,
            ...deviceInfo,
            loginMethod: 'phone',
            lastLoginAt: new Date(),
          };
          await createDeviceInfo(device);

          // For Testing
          resp.data = {
            user: user,
            accessToken: generateAccessToken(payload),
            refreshToken: generateRefreshToken(payload),
            deviceId: device.deviceId,
            flow: 'Driver Phone Number login',
          };
          // For Testing

          return resp;
        } else {
          if (!user) {
            user = await createUser({
              phoneNumber,
              roles: ['driver'],
              status: 'pending',
              userDeviceToken,
              userDeviceType,
              // For Production
              // isPhoneVerified: false,
              // For Production

              // For Testing
              isPhoneVerified: true,
              // For Testing
            });
            if (!user) throw new Error('Failed to create user');

            const uniqueId = generateUniqueId(user.roles[0], user._id);
            const driver = await createDriverProfile(user._id, uniqueId);
            if (!driver) throw new Error('Failed to create driver profile');

            const deviceInfo = await extractDeviceInfo(headers);
            const device = {
              userId: user._id,
              deviceId,
              deviceType: userDeviceType,
              deviceModel,
              deviceVendor,
              os,
              ...deviceInfo,
              loginMethod: 'phone',
              lastLoginAt: new Date(),
            };
            await createDeviceInfo(device);

            // For Testing
            const payload = { id: user._id, roles: user.roles };
            resp.data = {
              user: user,
              accessToken: generateAccessToken(payload),
              refreshToken: generateRefreshToken(payload),
              flow: 'login',
            };
            return resp;
            // For Testing
          }

          // For Production
          // const sent = await sendOtp(phoneNumber);
          // if (!sent.success) {
          //   resp.error = true;
          //   resp.error_message = 'Failed to send otp';
          //   return resp;
          // }
          // resp.data = { otpSent: true, flow: 'register' };
          // For Production

          user = await updateUserById(user._id, {
            userDeviceType,
          });
          if (!user) {
            resp.error = true;
            resp.error_message = 'Failed to update Device Type';
            return resp;
          }

          const deviceInfo = await extractDeviceInfo(headers);
          const device = {
            userId: user._id,
            deviceId,
            deviceType: userDeviceType,
            deviceModel,
            deviceVendor,
            os,
            ...deviceInfo,
            loginMethod: 'phone',
            lastLoginAt: new Date(),
          };
          await createDeviceInfo(device);

          // For Testing
          const payload = { id: user._id, roles: user.roles };
          resp.data = {
            user: user,
            accessToken: generateAccessToken(payload),
            refreshToken: generateRefreshToken(payload),
            flow: 'driver phone login',
          };
          // For Testing

          return resp;
        }
      }

      if (email) {
        let user = await findUserByEmail(email);
        if (user && user.isPhoneVerified) {
          // For Production
          // const sent = await sendOtp(phoneNumber);
          // resp.data = { otpSent: true, flow: 'login' };
          // For Production
          const success = await updateDriverByUserId(user._id, {
            isActive: true,
            status: 'online',
          });
          if (!success) {
            resp.error = true;
            resp.error_message = 'Failed to activate driver';
            return resp;
          }

          user = await updateUserById(user._id, {
            userDeviceType,
          });
          if (!user) {
            resp.error = true;
            resp.error_message = 'Failed to update Device Type';
            return resp;
          }

          const deviceInfo = await extractDeviceInfo(headers);
          const device = {
            userId: user._id,
            deviceId,
            deviceType: userDeviceType,
            deviceModel,
            deviceVendor,
            os,
            ...deviceInfo,
            loginMethod: 'email',
            lastLoginAt: new Date(),
          };
          await createDeviceInfo(device);

          // For Testing
          const payload = { id: user._id, roles: user.roles };
          resp.data = {
            user: user,
            accessToken: generateAccessToken(payload),
            refreshToken: generateRefreshToken(payload),
            deviceId: device.deviceId,
            flow: 'login',
          };
          // For Testing

          return resp;
        } else {
          if (!user) {
            user = await createUser({
              email,
              roles: ['driver'],
              status: 'pending',
              userDeviceToken,
              userDeviceType,
              // For Production
              // isPhoneVerified: false,
              // For Production

              // For Testing
              isPhoneVerified: true,
              // For Testing
            });
            const uniqueId = generateUniqueId(user.roles[0], user._id);

            await createDriverProfile(user._id, uniqueId);

            // For Testing
            const payload = { id: user._id, roles: user.roles };
            resp.data = {
              user: user,
              accessToken: generateAccessToken(payload),
              refreshToken: generateRefreshToken(payload),
              deviceId: device.deviceId,
              flow: 'driver email login',
            };
            return resp;
            // For Testing
          }

          // For Production
          // const sent = await sendOtp(phoneNumber);
          // if (!sent.success) {
          //   resp.error = true;
          //   resp.error_message = 'Failed to send otp';
          //   return resp;
          // }
          // resp.data = { otpSent: true, flow: 'register' };
          // For Production

          user = await updateUserById(user._id, {
            userDeviceType,
          });
          if (!user) {
            resp.error = true;
            resp.error_message = 'Failed to update Device Type';
            return resp;
          }

          const deviceInfo = await extractDeviceInfo(headers);
          const device = {
            userId: user._id,
            deviceId,
            deviceType: userDeviceType,
            deviceModel,
            deviceVendor,
            os,
            ...deviceInfo,
            loginMethod: 'email',
            lastLoginAt: new Date(),
          };
          await createDeviceInfo(device);

          // For Testing
          const payload = { id: user._id, roles: user.roles };
          resp.data = {
            user: user,
            accessToken: generateAccessToken(payload),
            refreshToken: generateRefreshToken(payload),
            deviceId: device.deviceId,
            flow: 'login',
          };
          // For Testing

          return resp;
        }
      }
    }

    resp.error = true;
    resp.error_message = 'Invalid role specified';
    return resp;
  } catch (err) {
    console.error(`API ERROR: ${err}`);
    resp.error = true;
    resp.error_message = err.message || 'Something went wrong';
    return resp;
  }
};

export const otpVerification = async (
  { role, email, phoneNumber, otp, type },
  resp,
) => {
  try {
    let user;

    // --- Identify user ---
    if (phoneNumber) {
      user = await findUserByPhone(phoneNumber);
    } else if (email) {
      user = await findUserByEmail(email);
    }

    if (!user) {
      resp.error = true;
      resp.error_message = 'User not found';
      return resp;
    }

    // --- Verify OTP ---
    const isValid = await verifyOtp(user.phoneNumber, otp);
    if (!isValid) {
      resp.error = true;
      resp.error_message = 'Invalid or expired OTP';
      return resp;
    }

    const userId = user._id.toString();

    // --- Handle OTP by type ---
    if (type === 'password-reset') {
      if (!user.roles.includes('passenger')) {
        resp.error = true;
        resp.error_message = 'Only passengers can reset password';
        return resp;
      }

      // mark flag for reset flow
      await updateUserById(userId, { canResetPassword: true });

      resp.data = { otpVerified: true, flow: 'password-reset' };
      return resp;
    }

    if (role === 'driver') {
      if (!user.isPhoneVerified) {
        user = await updateUserById(userId, {
          isPhoneVerified: true,
          // status: 'active',
        });

        let driverProfile = await findDriverByUserId(userId);
        if (!driverProfile) {
          driverProfile = await createPassengerProfile(userId);
        }

        const payload = { id: userId, roles: user.roles };
        resp.data = {
          user: user,
          accessToken: generateAccessToken(payload),
          refreshToken: generateRefreshToken(payload),
          flow: 'register',
        };
        return resp;
      }

      // already verified → login flow
      const payload = { id: userId, roles: user.roles };
      resp.data = {
        user: user,
        accessToken: generateAccessToken(payload),
        refreshToken: generateRefreshToken(payload),
        flow: 'login',
      };
      return resp;
    }

    if (role === 'passenger') {
      // verify phone if not already verified
      if (!user.isPhoneVerified) {
        await updateUserById({ _id: userId }, { isPhoneVerified: true });
      }

      const payload = { id: userId, roles: user.roles };
      resp.data = {
        user: user,
        accessToken: generateAccessToken(payload),
        refreshToken: generateRefreshToken(payload),
        flow: 'login',
      };
      return resp;
    }

    resp.error = true;
    resp.error_message = 'Invalid role or type specified';
    return resp;
  } catch (err) {
    console.error(`API ERROR: ${err}`);
    resp.error = true;
    resp.error_message = err.message || 'Something went wrong';
    return resp;
  }
};

export const forgotPassword = async ({ phoneNumber }, resp) => {
  try {
    const user = await findUserByPhone(phoneNumber);

    if (!user) {
      resp.error = true;
      resp.error_message = 'No user found with that phone number';
      return resp;
    }

    if (!user.roles.includes('passenger')) {
      resp.error = true;
      resp.error_message = 'Only passengers can reset password';
      return resp;
    }

    if (!user.isPhoneVerified) {
      resp.error = true;
      resp.error_message = 'Phone number is not verified';
      return resp;
    }

    // Send OTP for password rese
    const sent = await sendOtp(phoneNumber);
    if (!sent.success) {
      resp.error = true;
      resp.error_message = 'Failed to send otp';
      return resp;
    }

    resp.data = { otpSent: true };
    return resp;
  } catch (err) {
    console.error(`API ERROR: ${err}`);
    resp.error = true;
    resp.error_message = err.message || 'Something went wrong';
    return resp;
  }
};

export const resetUserPassword = async ({ newPassword, phoneNumber }, resp) => {
  try {
    const user = await findUserByPhone(phoneNumber);
    if (!user) {
      resp.error = true;
      resp.error_message = 'No user found for that phone number';
      return resp;
    }

    if (!user.roles.includes('passenger')) {
      resp.error = true;
      resp.error_message = 'Only passengers can reset password';
      return resp;
    }

    if (!user.canResetPassword) {
      resp.error = true;
      resp.error_message =
        'OTP verification required before resetting password';
      return resp;
    }

    const hashed = await hashPassword(newPassword);
    await updateUserById(user._id, {
      password: hashed,
      canResetPassword: false,
    });

    resp.data = { passwordReset: true };
    return resp;
  } catch (err) {
    console.error(`API ERROR: ${err}`);
    resp.error = true;
    resp.error_message = err.message || 'Something went wrong';
    return resp;
  }
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

export const passKeyLogInAuthOptions = async ({ type, provider }, resp) => {
  try {
    if (type !== 'driver')
      throw new Error('Only drivers can access this route');

    const success = await getPasskeyLoginOptions(provider);
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to passkey login';
      return resp;
    }

    resp.data = success;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${err}`);
    resp.error = true;
    resp.error_message = err.message || 'Something went wrong';
    return resp;
  }
};

export const verifyPasskeyLoginAuth = async (
  { type, provider, response },
  resp,
) => {
  try {
    if (type !== 'driver')
      throw new Error('Only drivers can access this route');

    const success = await verifyPasskeyLogin(provider, response);
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to verify passkey Login';
      return resp;
    }

    resp.data = { ...success, flow: 'passkey-login' };
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${err}`);
    resp.error = true;
    resp.error_message = err.message || 'Something went wrong';
    return resp;
  }
};

export const updateFCMToken = async (user, { userDeviceToken }, resp) => {
  try {
    console.log(userDeviceToken);
    const success = await updateUserById(user.id, {
      userDeviceToken,
    });
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to update Device Token';
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
