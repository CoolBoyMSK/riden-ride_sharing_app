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
  findUser,
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
  createDriverWallet,
} from '../../../dal/driver.js';
import {
  createPassengerStripeCustomer,
  createDriverStripeAccount,
  createPassengerWallet,
  createPayout,
} from '../../../dal/stripe.js';
import { createAdminNotification } from '../../../dal/notification.js';
import { createDeviceInfo } from '../../../dal/user/index.js';
import {
  getPasskeyLoginOptions,
  verifyPasskeyLogin,
} from '../../../utils/auth.js';
import { extractDeviceInfo } from '../../../utils/deviceInfo.js';
import env from '../../../config/envConfig.js';
import {
  requestEmailOtp,
  verifyEmailOtp,
  requestPhoneOtp,
  verifyPhoneOtp,
  emailOtpKey,
  emailCooldownKey,
  emailPendingKey,
  phoneOtpKey,
  phoneCooldownKey,
  phonePendingKey,
} from '../../../utils/otpUtils.js';
import redisConfig from '../../../config/redisConfig.js';
import crypto from 'crypto';

export const signupUser = async (
  users,
  { name, email, phoneNumber, gender, password, type },
  resp,
) => {
  let user;
  if (users) {
    user = await findUserById(users.id);
  }

  const hashed = await hashPassword(password);

  if (users && users.roles.includes('driver')) {
    if (user.userId.email?.trim()) {
      user = await updateUserById(
        { _id: user.userId._id },
        {
          name,
          phoneNumber,
          password: hashed,
          isCompleted: true,
        },
      );
    } else if (user.userId.phoneNumber?.trim()) {
      user = await updateUserById(
        { _id: user.userId._id },
        {
          email,
          name,
          password: hashed,
          isCompleted: true,
        },
      );
    }

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

    const wallet = await createDriverWallet(driverProfile._id);
    if (!wallet) {
      resp.error = true;
      resp.error_message = 'Failed to create driver wallet';
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
      roles: ['passenger'],
      password: hashed,
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
        const match = await comparePasswords(password, user.password);
        if (!match) {
          resp.error = true;
          resp.error_message = 'Invalid password';
          return resp;
        }

        if (user && !user.isEmailVerified) {
          const result = await requestEmailOtp(user.email, user.name);
          if (!result.ok) {
            resp.error = true;
            resp.error_message = `Failed to send OTP. Please wait ${result.waitSeconds || 60}s`;
            return resp;
          }
        }
      }

      if (phoneNumber) {
        user = await findUserByPhone(phoneNumber);
        const match = await comparePasswords(password, user.password);
        if (!match) {
          resp.error = true;
          resp.error_message = 'Invalid password';
          return resp;
        }

        if (user && !user.isPhoneVerified) {
          const result = await requestPhoneOtp(user.phoneNumber, user.name);
          if (!result.ok) {
            resp.error = true;
            resp.error_message = `Failed to send OTP. Please wait ${result.waitSeconds || 60}s`;
            return resp;
          }
        }
      }

      if (!password) {
        resp.error = true;
        resp.error_message = 'Password is required';
        return resp;
      }

      if (!user) {
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

      // ✅ If phone already verified → issue tokens
      if (email && !user.isEmailVerified) {
        resp.data = {
          emailOtp: true,
          message: `OTP has been sent to ${user.email}`,
          email: user.email,
        };
      } else if (phoneNumber && !user.isPhoneVerified) {
        resp.data = {
          phoneOtp: true,
          message: `OTP has been sent to ${user.phoneNumber}`,
          phoneNumber: user.phoneNumber,
        };
      } else {
        const passenger = await updatePassenger({ userId }, { isActive: true });
        if (!passenger) {
          resp.error = true;
          resp.error_message = 'Failed to activate passenger';
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

        const payload = { id: userId, roles: user.roles };
        resp.data = {
          user: user,
          accessToken: generateAccessToken(payload),
          refreshToken: generateRefreshToken(payload),
          flow: 'login',
        };
      }
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
        if (user) {
          const result = await requestPhoneOtp(user.phoneNumber, user.name);
          if (!result.ok) {
            resp.error = true;
            resp.error_message = `Failed to send OTP. Please wait ${result.waitSeconds || 60}s`;
            return resp;
          }

          resp.data = {
            phoneOtp: true,
            message: `OTP has been sent to ${user.phoneNumber}`,
            phoneNumber: user.phoneNumber,
          };
          return resp;
        }
        if (!user) {
          user = await createUser({
            phoneNumber,
            roles: ['driver'],
            userDeviceType,
          });
          if (!user) {
            resp.error = true;
            resp.error_message = 'Failed to create user';
            return resp;
          }

          const uniqueId = generateUniqueId(user.roles[0], user._id);

          const driver = await createDriverProfile(user._id, uniqueId);
          if (!driver) {
            resp.error = true;
            resp.error_message = 'Failed to create driver profile';
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

          const result = await requestPhoneOtp(user.phoneNumber, user.name);
          if (!result.ok) {
            resp.error = true;
            resp.error_message = `Failed to send OTP. Please wait ${result.waitSeconds || 60}s`;
            return resp;
          }

          resp.data = {
            phoneOtp: true,
            message: `OTP has been sent to ${user.phoneNumber}`,
            phoneNumber: user.phoneNumber,
          };
          return resp;
        }
      }

      if (email) {
        let user = await findUserByEmail(email);
        if (user) {
          const result = await requestEmailOtp(user.email, user.name);
          if (!result.ok) {
            resp.error = true;
            resp.error_message = `Failed to send OTP. Please wait ${result.waitSeconds || 60}s`;
            return resp;
          }

          resp.data = {
            emailOtp: true,
            message: `OTP has been sent to ${user.email}`,
            email: user.email,
          };
          return resp;
        }
        if (!user) {
          user = await createUser({
            email,
            roles: ['driver'],
            userDeviceType,
          });
          if (!user) {
            resp.error = true;
            resp.error_message = 'Failed to create user';
            return resp;
          }

          const uniqueId = generateUniqueId(user.roles[0], user._id);

          const driver = await createDriverProfile(user._id, uniqueId);
          if (!driver) {
            resp.error = true;
            resp.error_message = 'Failed to create driver profile';
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

          const result = await requestEmailOtp(user.email, user.name);
          if (!result.ok) {
            resp.error = true;
            resp.error_message = `Failed to send OTP. Please wait ${result.waitSeconds || 60}s`;
            return resp;
          }

          resp.data = {
            emailOtp: true,
            message: `OTP has been sent to ${user.email}`,
            email: user.email,
          };
          return resp;
        }
      }
    }

    resp.error = true;
    resp.error_message = 'Invalid role specified';
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'something went wrong';
    return resp;
  }
};

export const otpVerification = async (
  {
    phoneOtp,
    emailOtp,
    forgotPasswordPhoneOtp,
    forgotPasswordEmailOtp,
    phoneNumber,
    email,
    otp,
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
    let user;
    if (phoneOtp) {
      if (!phoneNumber || !otp) {
        resp.error = true;
        resp.error_message = 'Phone number and OTP are required';
        return resp;
      }

      const result = await verifyPhoneOtp(phoneNumber, otp);
      if (!result.ok) {
        resp.error = true;
        switch (result.reason) {
          case 'expired_or_not_requested':
            resp.error_message = 'OTP expired or not requested';
            break;
          case 'invalid_otp':
            resp.error_message = 'Invalid OTP';
            break;
          case 'too_many_attempts':
            resp.error_message = 'Too many failed attempts, try later';
            break;
          default:
            resp.error_message = 'Verification failed';
        }
        return resp;
      }

      user = await findUserByPhone(phoneNumber);
      if (!user) {
        resp.error = true;
        resp.error_message = 'User not found';
        return resp;
      } else if (!user.isPhoneVerified) {
        user = await updateUserById(user._id, {
          isPhoneVerified: true,
        });
      }

      user = await updateUserById(user._id, {
        userDeviceType,
      });
      if (!user) {
        resp.error = true;
        resp.error_message = 'Failed to update Device Type';
        return resp;
      }

      await redisConfig.del(
        phoneOtpKey(phoneNumber),
        phoneCooldownKey(phoneNumber),
        phonePendingKey(phoneNumber),
      );

      if (user.roles.includes('driver')) {
        let driver = await findDriverByUserId(user._id);
        if (!driver) {
          const uniqueId = generateUniqueId(user.roles[0], user._id);
          driver = await createDriverProfile(user._id, uniqueId);
          await updateDriverByUserId(user._id, {
            status: driver.status === 'offline' ? 'online' : driver.status,
            isActive: true,
          });
        } else {
          console.log('Available');
          driver = await updateDriverByUserId(user._id, {
            status: driver.status === 'offline' ? 'online' : driver.status,
            isActive: true,
          });
        }
      } else if (user.roles.includes('passenger')) {
        const passenger = await updatePassenger(
          { userId: user._id },
          { isActive: true },
        );
        if (!passenger) {
          resp.error = true;
          resp.error_message = 'Failed to activate passenger';
          return resp;
        }
      } else {
        resp.error = true;
        resp.error_message = 'Invalid user role';
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

      const payload = { id: user._id, roles: user.roles };
      resp.data = {
        user: user,
        accessToken: generateAccessToken(payload),
        refreshToken: generateRefreshToken(payload),
      };
      return resp;
    } else if (emailOtp) {
      if (!email || !otp) {
        resp.error = true;
        resp.error_message = 'Email and OTP are required';
        return resp;
      }

      const result = await verifyEmailOtp(email, otp);
      if (!result.ok) {
        resp.error = true;
        resp.error_message =
          result.reason === 'expired_or_not_requested'
            ? 'OTP expired or not requested'
            : 'Invalid OTP';
        return resp;
      }

      user = await findUserByEmail(email);
      if (!user) {
        resp.error = true;
        resp.error_message = 'User not found';
        return resp;
      } else if (!user.isPhoneVerified) {
        user = await updateUserById(user._id, {
          isEmailVerified: true,
        });
      }

      user = await updateUserById(user._id, {
        userDeviceType,
      });
      if (!user) {
        resp.error = true;
        resp.error_message = 'Failed to update Device Type';
        return resp;
      }

      // Final cleanup
      await redisConfig.del(
        emailOtpKey(email),
        emailCooldownKey(email),
        emailPendingKey(email),
      );

      if (user.roles.includes('driver')) {
        let driver = await findDriverByUserId(user._id);
        if (!driver) {
          const uniqueId = generateUniqueId(user.roles[0], user._id);
          driver = await createDriverProfile(user._id, uniqueId);
          await updateDriverByUserId(user._id, {
            status: driver.status === 'offline' ? 'online' : driver.status,
            isActive: true,
          });
        } else {
          console.log('Available');
          driver = await updateDriverByUserId(user._id, {
            status: driver.status === 'offline' ? 'online' : driver.status,
            isActive: true,
          });
        }
      } else if (user.roles.includes('passenger')) {
        const passenger = await updatePassenger(
          { userId: user._id },
          { isActive: true },
        );
        if (!passenger) {
          resp.error = true;
          resp.error_message = 'Failed to activate passenger';
          return resp;
        }
      } else {
        resp.error = true;
        resp.error_message = 'Invalid user role';
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

      const payload = { id: user._id, roles: user.roles };
      resp.data = {
        user: user,
        accessToken: generateAccessToken(payload),
        refreshToken: generateRefreshToken(payload),
      };
      return resp;
    } else if (forgotPasswordPhoneOtp) {
      if (!phoneNumber || !otp) {
        resp.error = true;
        resp.error_message = 'Phone number and OTP are required';
        return resp;
      }

      const result = await verifyPhoneOtp(phoneNumber, otp);
      if (!result.ok) {
        resp.error = true;
        switch (result.reason) {
          case 'expired_or_not_requested':
            resp.error_message = 'OTP expired or not requested';
            break;
          case 'invalid_otp':
            resp.error_message = 'Invalid OTP';
            break;
          case 'too_many_attempts':
            resp.error_message = 'Too many failed attempts, try later';
            break;
          default:
            resp.error_message = 'Verification failed';
        }
        return resp;
      }

      user = await findUserByPhone(phoneNumber);
      if (!user) {
        resp.error = true;
        resp.error_message = 'User not found';
        return resp;
      }

      await redisConfig.del(
        phoneOtpKey(phoneNumber),
        phoneCooldownKey(phoneNumber),
        phonePendingKey(phoneNumber),
      );

      try {
        const resetSessionKey = `password_reset_session:${user._id}`;

        const existingSession = await redisConfig.get(resetSessionKey);
        if (existingSession) {
          const parsed = JSON.parse(existingSession);
          const expired =
            !parsed.createdAt || Date.now() - parsed.createdAt > 10 * 60 * 1000;

          if (!expired) {
            // ⏱ Get remaining expiry time (in seconds)
            const ttlSeconds = await redisConfig.ttl(resetSessionKey);

            let remainingMsg = '';
            if (ttlSeconds > 0) {
              const minutes = Math.floor(ttlSeconds / 60);
              const seconds = ttlSeconds % 60;
              remainingMsg = `Please wait ${minutes} minute${minutes !== 1 ? 's' : ''} and ${seconds} second${seconds !== 1 ? 's' : ''} before trying again.`;
            }

            resp.error = true;
            resp.error_message = `A password reset session already exists. ${remainingMsg || 'Please wait until it expires or use the existing one.'}`;
            return resp;
          } else {
            await redisConfig.del(resetSessionKey);
          }
        }

        const resetSessionToken = crypto.randomBytes(32).toString('hex');

        await redisConfig.set(
          resetSessionKey,
          JSON.stringify({
            token: resetSessionToken,
            purpose: 'password_reset',
            createdAt: Date.now(),
            ip: headers?.ip || null, // optional: attach req.ip for trace
          }),
          'EX',
          10 * 60,
        );

        resp.data = {
          success: true,
          message:
            'OTP verified. You can now reset your password. The session will expire in 10 minutes',
          resetSessionToken,
        };
      } catch (error) {
        console.error(`REDIS ERROR: ${error}`);
        resp.error = true;
        resp.error_message = error.message || 'Something went wrong';
        return resp;
      }

      return resp;
    } else if (forgotPasswordEmailOtp) {
      if (!email || !otp) {
        resp.error = true;
        resp.error_message = 'Email and OTP are required';
        return resp;
      }

      const result = await verifyEmailOtp(email, otp, 'password_reset');
      if (!result.ok) {
        resp.error = true;
        resp.error_message =
          result.reason === 'expired_or_not_requested'
            ? 'OTP expired or not requested'
            : 'Invalid OTP';
        return resp;
      }

      user = await findUserByEmail(email);
      if (!user) {
        resp.error = true;
        resp.error_message = 'User not found';
        return resp;
      }

      await redisConfig.del(
        emailOtpKey(email),
        emailCooldownKey(email),
        emailPendingKey(email),
      );

      try {
        const resetSessionKey = `password_reset_session:${user._id}`;

        const existingSession = await redisConfig.get(resetSessionKey);
        if (existingSession) {
          const parsed = JSON.parse(existingSession);
          const expired =
            !parsed.createdAt || Date.now() - parsed.createdAt > 10 * 60 * 1000;

          if (!expired) {
            // ⏱ Get remaining expiry time (in seconds)
            const ttlSeconds = await redisConfig.ttl(resetSessionKey);

            let remainingMsg = '';
            if (ttlSeconds > 0) {
              const minutes = Math.floor(ttlSeconds / 60);
              const seconds = ttlSeconds % 60;
              remainingMsg = `Please wait ${minutes} minute${minutes !== 1 ? 's' : ''} and ${seconds} second${seconds !== 1 ? 's' : ''} before trying again.`;
            }

            resp.error = true;
            resp.error_message = `A password reset session already exists. ${remainingMsg || 'Please wait until it expires or use the existing one.'}`;
            return resp;
          } else {
            await redisConfig.del(resetSessionKey);
          }
        }

        const resetSessionToken = crypto.randomBytes(32).toString('hex');

        await redisConfig.set(
          resetSessionKey,
          JSON.stringify({
            token: resetSessionToken,
            purpose: 'password_reset',
            createdAt: Date.now(),
            ip: headers?.ip || null, // optional: attach req.ip for trace
          }),
          'EX',
          10 * 60,
        );

        resp.data = {
          success: true,
          message:
            'OTP verified. You can now reset your password. The session will expire in 10 minutes',
          resetSessionToken,
        };
      } catch (error) {
        console.error(`REDIS ERROR: ${error}`);
        resp.error = true;
        resp.error_message = error.message || 'Something went wrong';
        return resp;
      }

      return resp;
    } else {
      resp.error = true;
      resp.error_message = 'Invalid OTP Type';
      return resp;
    }
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'Something went wrong';
    return resp;
  }
};

export const forgotPassword = async ({ phoneNumber, email }, resp) => {
  try {
    if (email) {
      const user = await findUserByEmail(email);
      if (!user) {
        resp.error = true;
        resp.error_message = 'No user found with that phone number';
        return resp;
      }

      if (!user.isEmailVerified) {
        resp.error = true;
        resp.error_message = 'Email is not verified';
        return resp;
      }

      const result = await requestEmailOtp(user.email, user.name, {
        purpose: 'password_reset',
      });
      if (!result.ok) {
        resp.error = true;
        resp.error_message = `Failed to send OTP. Please wait ${result.waitSeconds || 60}s`;
        return resp;
      }

      resp.data = {
        forgotPasswordEmailOtp: true,
        message: `OTP has been sent to ${user.email}`,
        email: user.email,
      };
      return resp;
    } else if (phoneNumber) {
      const user = await findUserByPhone(phoneNumber);
      if (!user) {
        resp.error = true;
        resp.error_message = 'No user found with that phone number';
        return resp;
      }

      if (!user.isPhoneVerified) {
        resp.error = true;
        resp.error_message = 'Phone number is not verified';
        return resp;
      }

      const result = await requestPhoneOtp(user.phoneNumber, user.name);
      if (!result.ok) {
        resp.error = true;
        resp.error_message = `Failed to send OTP. Please wait ${result.waitSeconds || 60}s`;
        return resp;
      }

      resp.data = {
        forgotPasswordPhoneOtp: true,
        message: `OTP has been sent to ${user.phoneNumber}`,
        phoneNumber: user.phoneNumber,
      };
      return resp;
    } else {
      resp.error = true;
      resp.error_message = 'Invalid method';
      return resp;
    }
  } catch (err) {
    console.error(`API ERROR: ${err}`);
    resp.error = true;
    resp.error_message = err.message || 'Something went wrong';
    return resp;
  }
};

export const resetUserPassword = async (
  { newPassword, email, phoneNumber, resetSessionToken },
  resp,
) => {
  try {
    let user;
    if (email) {
      if (!resetSessionToken || !newPassword) {
        resp.error = true;
        resp.error_message = 'session token, and new password are required';
        return resp;
      }

      user = await findUserByEmail(email);
      if (!user) {
        resp.error = true;
        resp.error_message = 'No user found for that email';
        return resp;
      }
    } else if (phoneNumber) {
      if (!resetSessionToken || !newPassword) {
        resp.error = true;
        resp.error_message = 'session token, and new password are required';
        return resp;
      }

      user = await findUserByPhone(phoneNumber);
      if (!user) {
        resp.error = true;
        resp.error_message = 'No user found for that phone number';
        return resp;
      }
    } else {
      resp.error = true;
      resp.error_message = 'No user found';
      return resp;
    }

    const resetSessionKey = `password_reset_session:${user._id}`;

    // 🧠 Fetch session data from Redis
    const sessionData = await redisConfig.get(resetSessionKey);
    if (!sessionData) {
      resp.error = true;
      resp.error_message = 'Password reset session expired or not found';
      return resp;
    }

    let parsedSession;
    try {
      parsedSession = JSON.parse(sessionData);
    } catch (error) {
      console.error(`REDIS ERROR: ${error}`);
      await redisConfig.del(resetSessionKey);
      resp.error = true;
      resp.error_message = error.message || 'Something went wrong';
      return resp;
    }

    // 🔐 Validate token & purpose
    if (parsedSession.token !== resetSessionToken) {
      resp.error = true;
      resp.error_message = 'Invalid or mismatched reset session token';
      return resp;
    }

    if (parsedSession.purpose !== 'password_reset') {
      resp.error = true;
      resp.error_message = 'Invalid session purpose';
      return resp;
    }

    // 🕐 Check expiry manually (defensive, Redis already auto-expires)
    const maxAgeMs = 10 * 60 * 1000; // 10 minutes
    if (Date.now() - parsedSession.createdAt > maxAgeMs) {
      await redisConfig.del(resetSessionKey);
      resp.error = true;
      resp.error_message = 'Password reset session has expired';
      return resp;
    }

    // ✅ Hash and update password
    const hashedPassword = await hashPassword(newPassword);
    await updateUserById(user._id, { password: hashedPassword });

    // 🧹 Cleanup session
    await redisConfig.del(resetSessionKey);

    resp.data = {
      success: true,
      message: 'Password reset successful',
    };
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

export const socialLoginUser = async (
  {
    name,
    email,
    gender,
    role,
    userSocialToken,
    deviceId,
    userDeviceType,
    deviceModel,
    deviceVendor,
    os,
  },
  headers,
  resp,
) => {
  let user = await findUserByEmail(email?.trim());

  if (role === 'driver') {
    if (user && user.roles.includes('driver')) {
      if (user.userSocialToken?.trim()) {
        let driver = await findDriverByUserId(user._id);
        if (!driver) {
          const uniqueId = generateUniqueId(user.roles[0], user._id);
          driver = await createDriverProfile(user._id, uniqueId);
          await updateDriverByUserId(user._id, {
            status: driver.status === 'offline' ? 'online' : driver.status,
            isActive: true,
          });
        } else {
          driver = await updateDriverByUserId(user._id, {
            status: driver.status === 'offline' ? 'online' : driver.status,
            isActive: true,
          });
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
          loginMethod: 'oauth',
          lastLoginAt: new Date(),
        };
        await createDeviceInfo(device);

        const payload = { id: user._id, roles: user.roles };
        resp.data = {
          user,
          accessToken: generateAccessToken(payload),
          refreshToken: generateRefreshToken(payload),
        };
        return resp;
      } else {
        resp.error = true;
        resp.error_message = 'Email already registered';
        return resp;
      }
    } else if (!user) {
      user = await createUser({
        name,
        email,
        gender,
        roles: ['driver'],
        userSocialToken,
      });

      let driver = await findDriverByUserId(user._id);
      if (!driver) {
        const uniqueId = generateUniqueId(user.roles[0], user._id);
        driver = await createDriverProfile(user._id, uniqueId);
        await updateDriverByUserId(user._id, {
          status: driver.status === 'offline' ? 'online' : driver.status,
          isActive: true,
        });
      } else {
        driver = await updateDriverByUserId(user._id, {
          status: driver.status === 'offline' ? 'online' : driver.status,
          isActive: true,
        });
      }

      const stripeAccountId = await createDriverStripeAccount(user, driver);
      if (!stripeAccountId) {
        resp.error = true;
        resp.error_message = 'Failed to create stripe Account Id';
        return resp;
      }

      const wallet = await createDriverWallet(driver._id);
      if (!wallet) {
        resp.error = true;
        resp.error_message = 'Failed to create driver wallet';
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
        loginMethod: 'oauth',
        lastLoginAt: new Date(),
      };
      await createDeviceInfo(device);

      const notify = await createAdminNotification({
        title: 'New Driver Registered',
        message: `${user.name} registered as drive successfully, Their Email: ${user.email}`,
        metadata: user,
        module: 'passenger_management',
        type: 'ALERT',
        actionLink: `${env.FRONTEND_URL}/api/admin/passengers/fetch/${driver._id}`,
      });
      if (!notify) {
        resp.error = true;
        resp.error_message = 'Failed to send notification';
        return resp;
      }

      const payload = { id: user._id, roles: user.roles };
      resp.data = {
        user,
        accessToken: generateAccessToken(payload),
        refreshToken: generateRefreshToken(payload),
      };
      return resp;
    } else {
      resp.error = true;
      resp.error_message = 'Unexpected Error';
      return resp;
    }
  }

  if (role === 'passenger') {
    if (user && user.roles.includes('passenger')) {
      if (user.userSocialToken?.trim()) {
        let passenger = await findPassengerByUserId(user._id);
        if (!passenger) {
          const uniqueId = generateUniqueId(user.roles[0], user._id);
          passenger = await createPassengerProfile(user._id, uniqueId);
          await updatePassenger({ userId: user._id }, { isActive: true });
        } else {
          passenger = await updatePassenger(
            { userId: user._id },
            { isActive: true },
          );
          if (!passenger) {
            resp.error = true;
            resp.error_message = 'Failed to activate passenger';
            return resp;
          }
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
          loginMethod: 'oauth',
          lastLoginAt: new Date(),
        };
        await createDeviceInfo(device);

        const payload = { id: user._id, roles: user.roles };
        resp.data = {
          user,
          accessToken: generateAccessToken(payload),
          refreshToken: generateRefreshToken(payload),
        };
        return resp;
      } else {
        resp.error = true;
        resp.error_message = 'Email already registered';
        return resp;
      }
    } else if (!user) {
      user = await createUser({
        name,
        email,
        gender,
        roles: ['passenger'],
        userSocialToken,
      });

      let passenger = await findPassengerByUserId(user._id);
      if (!passenger) {
        const uniqueId = generateUniqueId(user.roles[0], user._id);
        passenger = await createPassengerProfile(user._id, uniqueId);
        await updatePassenger({ userId: user._id }, { isActive: true });
      } else {
        passenger = await updatePassenger(
          { userId: user._id },
          { isActive: true },
        );
        if (!passenger) {
          resp.error = true;
          resp.error_message = 'Failed to activate passenger';
          return resp;
        }
      }

      const stripeCustomerId = await createPassengerStripeCustomer(
        user,
        passenger,
      );
      if (!stripeCustomerId) {
        resp.error = true;
        resp.error_message = 'Failed to create stripe customer account';
        return resp;
      }

      const wallet = await createPassengerWallet(passenger._id);
      if (!wallet) {
        resp.error = true;
        resp.error_message = 'Failed to create In-App wallet';
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
        loginMethod: 'oauth',
        lastLoginAt: new Date(),
      };
      await createDeviceInfo(device);

      const notify = await createAdminNotification({
        title: 'New Passenger Registered',
        message: `${user.name} registered as passenger successfully, Their  Email: ${user.email}`,
        metadata: user,
        module: 'passenger_management',
        type: 'ALERT',
        actionLink: `${env.FRONTEND_URL}/api/admin/passengers/fetch-passenger/${passenger._id}`,
      });
      if (!notify) {
        resp.error = true;
        resp.error_message = 'Failed to send notification';
        return resp;
      }

      const payload = { id: user._id, roles: user.roles };
      resp.data = {
        user,
        accessToken: generateAccessToken(payload),
        refreshToken: generateRefreshToken(payload),
      };
      return resp;
    } else {
      resp.error = true;
      resp.error_message = 'Unexpected Error';
      return resp;
    }
  }

  resp.error = true;
  resp.error_message = 'Invalid User role';
  return resp;
};
