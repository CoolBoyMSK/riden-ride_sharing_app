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
} from '../../../dal/driver.js';
import {
  createPassengerStripeCustomer,
  createDriverStripeAccount,
  createPassengerWallet,
  createDriverWallet,
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
  resendEmailOtp,
  requestPhoneOtp,
  verifyPhoneOtp,
  resendPhoneOtp,
  emailOtpKey,
  emailCooldownKey,
  emailPendingKey,
  phoneOtpKey,
  phoneCooldownKey,
  phonePendingKey,
} from '../../../utils/otpUtils.js';
import redisConfig from '../../../config/redisConfig.js';
import { notifyUser } from '../../../dal/notification.js';
import crypto from 'crypto';
import {
  sendPhoneOtpEmail,
  sendWelcomePassengerEmail,
  sendPassengerResetPasswordEmail,
  sendWelcomeDriverEmail,
} from '../../../templates/emails/user/index.js';
import { verifyGoogleToken } from '../../../utils/verifySocials.js';

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
      message: `${user.name} registered as driver successfully, Their Phone No: ${user.phoneNumber} and Email: ${user.email}`,
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

    await sendWelcomeDriverEmail(user.email, user.name);

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
    user = await findUserByPhone(phoneNumber);
    if (user && user.isPhoneVerified) {
      resp.error = true;
      resp.error_message = 'Phone number already in use';
      return resp;
    }

    const userData = {
      name,
      email,
      gender,
      roles: ['passenger'],
      password: hashed,
      isCompleted: true,
    };

    const result = await requestEmailOtp(
      email,
      name,
      userData,
      'signup',
      'passenger',
    );
    if (!result.ok) {
      resp.error = true;
      resp.error_message = `Failed to send OTP. Please wait ${result.waitSeconds || 60}s`;
      return resp;
    }

    resp.data = {
      signupOtp: true,
      message: `Email verification OTP to register passenger has been sent to ${email}`,
      email: email,
    };
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

      if (!password) {
        resp.error = true;
        resp.error_message = 'Password is required';
        return resp;
      }

      if (email) {
        user = await findUserByEmail(email);
        if (!user) {
          resp.error = true;
          resp.error_message = `User not found`;
          return resp;
        }

        const match = await comparePasswords(password, user.password);
        if (!match) {
          resp.error = true;
          resp.error_message = 'Invalid password';
          return resp;
        }

        if (user) {
          const result = await requestEmailOtp(
            user.email,
            user.name,
            {},
            '',
            'passenger',
          );
          if (!result.ok) {
            resp.error = true;
            resp.error_message = `Failed to send OTP. Please wait ${result.waitSeconds || 60}s`;
            return resp;
          } else {
            resp.data = {
              emailOtp: true,
              message: `OTP has been sent to ${user.email}`,
              email: user.email,
            };
            return resp;
          }
        }
      }

      if (phoneNumber) {
        user = await findUserByPhone(phoneNumber);
        if (!user) {
          resp.error = true;
          resp.error_message = `User not found`;
          return resp;
        }

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
          } else {
            await sendPhoneOtpEmail(
              user.email,
              user.name,
              user.phoneNumber.slice(-4),
            );
          }
        }
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

        // Notification Logic Start
        const notify = await notifyUser({
          userId: user._id,
          title: 'Passenger Login successful 😎',
          message: `${user.name} has logged in successfully with ${user.email}`,
          module: 'support',
          metadata: user,
          type: 'ALERT',
          actionLink: `${env.BASE_URL}/api/user/profile/me`,
        });
        if (!notify) {
          console.error('Failed to send notification');
        }
        // Notification Logic End

        const payload = { id: userId, roles: user.roles };
        const accessToken = generateAccessToken(payload);
        const refreshToken = generateRefreshToken(payload);
        
        // Log active passenger login with role and token
        console.log('🔐 [ACTIVE] PASSENGER LOGIN:', {
          userId,
          role: 'passenger',
          name: user.name,
          email: user.email,
          phoneNumber: user.phoneNumber,
          accessToken: accessToken,
          refreshToken: refreshToken,
          timestamp: new Date().toISOString(),
        });
        
        resp.data = {
          user: user,
          accessToken,
          refreshToken,
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
          const result = await requestEmailOtp(
            user.email,
            user.name,
            {},
            null,
            user.roles[0],
          );
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

          const result = await requestEmailOtp(
            user.email,
            user.name,
            {},
            null,
            user.roles[0],
          );
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
    verifyPhoneNumberOtp,
    signupOtp,
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

    if (signupOtp) {
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

      const user = await createUser({
        ...result.pending,
        isEmailVerified: true,
      });
      if (!user) {
        resp.error = true;
        resp.error_message = 'Failed to register passenger';
        return resp;
      }

      const uniqueId = generateUniqueId(user.roles[0], user._id);
      const passengerProfile = await createPassengerProfile(user._id, uniqueId);
      if (!passengerProfile) {
        resp.error = true;
        resp.error_message = 'Failed to create passenger profile';
        return resp;
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
        console.error('Failed to send notification');
      }

      await sendWelcomePassengerEmail(user.email, user.name);

      // Final cleanup
      await redisConfig.del(
        emailOtpKey(email),
        emailCooldownKey(email),
        emailPendingKey(email),
      );

      const userObj = user.toObject();
      delete userObj.password;
      resp.data = userObj;
      return resp;
    }

    if (emailOtp) {
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
      } else if (
        user.roles.includes('passenger') &&
        (!user.phoneNumber || !user.isPhoneVerified)
      ) {
        resp.data = {
          verifyPhone: true,
          message: `Phone Number verification is required. Please verify your phone number to complete the login process.`,
          userId: user._id,
        };
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
      const accessToken = generateAccessToken(payload);
      const refreshToken = generateRefreshToken(payload);
      
      // Log active user login with role and token (for OTP verification)
      const userRole = user.roles?.[0] || 'unknown';
      console.log(`🔐 [ACTIVE] ${userRole.toUpperCase()} LOGIN (OTP Verification):`, {
        userId: user._id,
        role: userRole,
        name: user.name,
        email: user.email,
        phoneNumber: user.phoneNumber,
        accessToken: accessToken,
        refreshToken: refreshToken,
        timestamp: new Date().toISOString(),
      });
      
      resp.data = {
        user: user,
        accessToken,
        refreshToken,
      };
      return resp;
    }

    if (verifyPhoneNumberOtp) {
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
      if (user) {
        resp.error = true;
        resp.error_message = 'Phone Number already exists';
        return resp;
      }

      user = await updateUserById(result.pending?.userId, {
        phoneNumber: result.pending?.phoneNumber,
        isPhoneVerified: true,
        userDeviceType,
      });
      if (!user) {
        resp.error = true;
        resp.error_message = 'Failed to verify phone number';
        return resp;
      }

      await redisConfig.del(
        phoneOtpKey(phoneNumber),
        phoneCooldownKey(phoneNumber),
        phonePendingKey(phoneNumber),
      );

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
    }

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
    }

    if (forgotPasswordPhoneOtp) {
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
    }

    if (forgotPasswordEmailOtp) {
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
    }

    resp.error = true;
    resp.error_message = 'Invalid OTP Type';
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'Something went wrong';
    return resp;
  }
};

export const sendPassengerPhoneOtp = async (
  { userId, phoneNumber, verifyPhone },
  resp,
) => {
  try {
    if (verifyPhone) {
      if (!phoneNumber || !userId) {
        resp.error = true;
        resp.error_message = 'Phone number and userId is required is required';
        return resp;
      }
      const user = await findUserById(userId);
      if (!user) {
        resp.error = true;
        resp.error_message = 'User not found';
        return resp;
      }

      const isUser = await findUserByPhone(phoneNumber);
      if (isUser) {
        resp.error = true;
        resp.error_message = 'Phone Number already exists';
        return resp;
      }

      const result = await requestPhoneOtp(phoneNumber, user.userId?.name, {
        userId: user.userId?._id,
        phoneNumber,
      });
      if (!result.ok) {
        resp.error = true;
        resp.error_message = `Failed to send OTP. Please wait ${result.waitSeconds || 60}s`;
        return resp;
      } else {
        await sendPhoneOtpEmail(user.email, user.name, phoneNumber.slice(-4));
      }

      resp.data = {
        verifyPhoneNumberOtp: true,
        message: `Phone Number verification OTP has been sent to ${phoneNumber}`,
        phoneNumber,
      };
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

      const result = await requestEmailOtp(
        user.email,
        user.name,
        {
          purpose: 'password_reset',
        },
        'password_reset',
        user.roles[0],
      );
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

      await sendPassengerResetPasswordEmail(
        user.email,
        user.name,
        user.phoneNumber.slice(-4),
      );

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

export const resendOtp = async (
  { emailOtp, phoneOtp, email, phoneNumber },
  resp,
) => {
  try {
    if (emailOtp) {
      let user = await findUserByEmail(email);
      if (!user) {
        resp.error = true;
        resp.error_message = `User not found`;
        return resp;
      }
      const result = await resendEmailOtp(
        user.email,
        user.name,
        {},
        null,
        user.roles[0],
      );
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
    } else if (phoneOtp) {
      let user = await findUserByPhone(phoneNumber);
      if (!user) {
        resp.error = true;
        resp.error_message = `User not found`;
        return resp;
      }
      const result = await resendPhoneOtp(user.phoneNumber, user.name);
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
    } else {
      resp.error = true;
      resp.error_message = 'Either emailOtp or phoneOtp must be provided';
      return resp;
    }
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'Something went wrong';
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
    email,
    userSocialToken,
    userSocialProvider,
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
    if (userSocialProvider !== 'google' && userSocialProvider !== 'apple') {
      resp.error = true;
      resp.error_message = 'Unsupported social provider';
      return resp;
    }

    let user = await findUserByEmail(email?.trim());

    if (!user) {
      const isVerified = await verifyGoogleToken(userSocialToken, email);
      if (!isVerified) {
        resp.error = true;
        resp.error_message = 'Invalid social token';
        return resp;
      } else if (!isVerified.email_verified) {
        resp.error = true;
        resp.error_message = 'Email not verified by google';
        return resp;
      } else if (isVerified.email.toLowerCase() !== email.toLowerCase()) {
        resp.error = true;
        resp.error_message = 'Email not verified by google';
        return resp;
      }

      user = await createUser({
        name: isVerified.name,
        email: isVerified.email,
        roles: ['driver'],
        userSocialToken,
        userSocialProvider,
      });

      const uniqueId = generateUniqueId(user.roles[0], user._id);

      let driver = await createDriverProfile(user._id, uniqueId);
      driver = await updateDriverByUserId(user._id, { isActive: true });
      if (!driver) {
        resp.error = true;
        resp.error_message = 'Failed to activate passenger';
        return resp;
      }

      const stripeCustomerId = await createDriverStripeAccount(user, driver);
      if (!stripeCustomerId) {
        resp.error = true;
        resp.error_message = 'Failed to create stripe customer account';
        return resp;
      }

      const wallet = await createDriverWallet(driver._id);
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
        title: 'New Driver Registered',
        message: `${user.name} registered as driver successfully, Their  Email: ${user.email}`,
        metadata: user,
        module: 'driver_management',
        type: 'ALERT',
        actionLink: `${env.FRONTEND_URL}/api/admin/drivers/fetch-driver/${driver._id}`,
      });
      if (!notify) {
        resp.error = true;
        resp.error_message = 'Failed to send notification';
        return resp;
      }

      resp.data = {
        verifyPhone: true,
        message: `Phone Number verification is required. Please verify your phone number to complete the login process.`,
        email: user.email,
      };
      return resp;
    } else if (user && user.roles.includes('driver')) {
      const isVerified = await verifyGoogleToken(userSocialToken, user.email);
      if (!isVerified) {
        resp.error = true;
        resp.error_message = 'Invalid social token';
        return resp;
      } else if (!isVerified.email_verified) {
        resp.error = true;
        resp.error_message = 'Email not verified by google';
        return resp;
      } else if (isVerified.email.toLowerCase() !== user.email.toLowerCase()) {
        resp.error = true;
        resp.error_message = 'Email not verified by google';
        return resp;
      }

      if (!user.phoneNumber || !user.isPhoneVerified) {
        resp.data = {
          verifyPhone: true,
          message: `Phone Number verification is required. Please verify your phone number to complete the login process.`,
          email: user.email,
        };
        return resp;
      }

      if (user.userSocialToken !== userSocialToken) {
        user = await updateUserById(user._id, {
          userSocialToken,
          userSocialProvider,
          userDeviceType,
        });
      } else if (user.userSocialToken === userSocialToken) {
        user = await updateUserById(user._id, {
          userDeviceType,
        });
      }

      let driver = await updateDriverByUserId(user._id, { isActive: true });
      if (!driver) {
        resp.error = true;
        resp.error_message = 'Driver profile not found';
        return resp;
      } else if (!driver.isActive) {
        resp.error = true;
        resp.error_message = 'Failed to activate driver';
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

      const payload = { id: user._id, roles: user.roles };
      resp.data = {
        success: true,
        message: 'Social login successful',
        user,
        accessToken: generateAccessToken(payload),
        refreshToken: generateRefreshToken(payload),
      };
      return resp;
    } else {
      resp.error = true;
      resp.error_message = 'Unexpected Error occurred';
      return resp;
    }
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'Something went wrong';
    return resp;
  }
};
