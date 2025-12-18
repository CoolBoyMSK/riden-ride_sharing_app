import {
  hashPassword,
  comparePasswords,
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  generateUniqueId,
} from '../../../../utils/auth.js';
import {
  findUserByEmail,
  findUserByPhone,
  createUser,
  updateUserById,
} from '../../../../dal/user/index.js';
import {
  createPassengerProfile,
  updatePassenger,
} from '../../../../dal/passenger.js';
import {
  createPassengerStripeCustomer,
  createPassengerWallet,
} from '../../../../dal/stripe.js';
import { createAdminNotification } from '../../../../dal/notification.js';
import { createDeviceInfo } from '../../../../dal/user/index.js';
import { extractDeviceInfo } from '../../../../utils/deviceInfo.js';
import env from '../../../../config/envConfig.js';
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
} from '../../../../utils/otpUtils.js';
import redisConfig from '../../../../config/redisConfig.js';
import crypto from 'crypto';
import {
  sendPhoneOtpEmail,
  sendWelcomePassengerEmail,
  sendPassengerResetPasswordEmail,
} from '../../../../templates/emails/user/index.js';
import {
  validatePassengerSignup,
  validatePassengerPhoneSignup,
} from '../../../../validations/user/authValidations.js';
import { verifyGoogleToken } from '../../../../utils/verifySocials.js';

export const signUpPassenger = async (
  { name, email, gender, password, confirmPassword },
  resp,
) => {
  try {
    const validation = validatePassengerSignup({
      name,
      email,
      gender,
      password,
      confirmPassword,
    });
    if (validation.error) {
      resp.error = true;
      resp.error_message = validation.error.details.map((d) => d.message);
      return resp;
    }

    const hashed = await hashPassword(password);
    if (!hashed) {
      resp.error = true;
      resp.error_message = 'Unable to process password';
      return resp;
    }

    let user = await findUserByEmail(email);
    if (user && user.roles.includes('passenger')) {
      resp.error = true;
      resp.error_message = 'Email already in use';
      return resp;
    }

    const userData = {
      name,
      email,
      gender,
      roles: ['passenger'],
      password: hashed,
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
      // Local / staging testing: include OTP in response (hidden in production)
      // otp: env.NODE_ENV === 'production' ? undefined : result.otp,
    };
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'Something went wrong';
    return resp;
  }
};

export const signUpPassengerWithEmail = async (
  { name, email, gender, password, confirmPassword },
  resp,
) => {
  try {
    const validation = validatePassengerSignup({
      name,
      email,
      gender,
      password,
      confirmPassword,
    });
    if (validation.error) {
      resp.error = true;
      resp.error_message = validation.error.details.map((d) => d.message);
      return resp;
    }

    const hashed = await hashPassword(password);
    if (!hashed) {
      resp.error = true;
      resp.error_message = 'Unable to process password';
      return resp;
    }

    let user = await findUserByEmail(email);
    if (user) {
      resp.error = true;
      resp.error_message = 'Email already in use';
      return resp;
    }

    const userData = {
      name,
      email,
      gender,
      roles: ['passenger'],
      password: hashed,
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
      // otp: result.otp, // local / staging: OTP direct response me milega
    };
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'Something went wrong';
    return resp;
  }
};

export const signUpPassengerWithPhone = async (
  { name, phoneNumber, gender, password, confirmPassword },
  resp,
) => {
  try {
    const validation = validatePassengerPhoneSignup({
      name,
      phoneNumber,
      gender,
      password,
      confirmPassword,
    });
    if (validation.error) {
      resp.error = true;
      resp.error_message = validation.error.details.map((d) => d.message);
      return resp;
    }

    const hashed = await hashPassword(password);
    if (!hashed) {
      resp.error = true;
      resp.error_message = 'Unable to process password';
      return resp;
    }

    let user = await findUserByPhone(phoneNumber);
    if (user) {
      resp.error = true;
      resp.error_message = 'Phone number already in use';
      return resp;
    }

    const userData = {
      name,
      phoneNumber,
      gender,
      roles: ['passenger'],
      password: hashed,
    };

    const result = await requestPhoneOtp(
      phoneNumber,
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
      message: `Phone number verification OTP to register passenger has been sent to ${phoneNumber}`,
      phoneNumber: phoneNumber,
    };
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'Something went wrong';
    return resp;
  }
};

export const loginUser = async ({ email, phoneNumber, password }, resp) => {
  try {
    let user;

    if (email) {
      user = await findUserByEmail(email);
      if (!user) {
        resp.error = true;
        resp.error_message = `User not found`;
        return resp;
      } else if (!user.roles.includes('passenger') || !user.isEmailVerified) {
        resp.error = true;
        resp.error_message = `Only verified passengers can login here`;
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
      } else {
        resp.error = true;
        resp.error_message = 'Unexpected error occured';
        return resp;
      }
    } else if (phoneNumber) {
      user = await findUserByPhone(phoneNumber);
      if (!user) {
        resp.error = true;
        resp.error_message = `User not found`;
        return resp;
      } else if (!user.roles.includes('passenger') || !user.isPhoneVerified) {
        resp.error = true;
        resp.error_message = `Only verified passengers can login here`;
        return resp;
      }

      const match = await comparePasswords(password, user.password);
      if (!match) {
        resp.error = true;
        resp.error_message = 'Invalid password';
        return resp;
      }

      if (user) {
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

          resp.data = {
            phoneOtp: true,
            message: `OTP has been sent to ${user.phoneNumber}`,
            phoneNumber: user.phoneNumber,
          };
          return resp;
        }
      } else {
        resp.error = true;
        resp.error_message = 'Unexpected error occured';
        return resp;
      }
    } else {
      resp.error = true;
      resp.error_message = 'Unable to process login';
      return resp;
    }
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
        roles: ['passenger'],
        isEmailVerified: true,
        userSocialToken,
        userSocialProvider,
      });

      const uniqueId = generateUniqueId(user.roles[0], user._id);

      let passenger = await createPassengerProfile(user._id, uniqueId);
      passenger = await updatePassenger(
        { userId: user._id },
        { isActive: true },
      );
      if (!passenger) {
        resp.error = true;
        resp.error_message = 'Failed to activate passenger';
        return resp;
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

      resp.data = {
        verifyPhone: true,
        message: `Phone Number verification is required. Please verify your phone number to complete the login process.`,
        email: user.email,
      };
      return resp;
    } else if (user && user.roles.includes('passenger')) {
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

      let passenger = await updatePassenger(
        { userId: user._id },
        { isActive: true },
      );
      if (!passenger) {
        resp.error = true;
        resp.error_message = 'Passenger profile not found';
        return resp;
      } else if (!passenger.isActive) {
        resp.error = true;
        resp.error_message = 'Failed to activate passenger';
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

export const otpVerification = async (
  {
    signupOtp,
    phoneOtp,
    emailOtp,
    verifyPhoneNumberOtp,
    verifyUserEmailOtp,
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
      if (email && otp) {
        const result = await verifyEmailOtp(email, otp);
        if (!result.ok) {
          resp.error = true;
          resp.error_message =
            result.reason === 'expired_or_not_requested'
              ? 'OTP expired or not requested'
              : 'Invalid OTP';
          return resp;
        }

        user = await createUser({
          ...result.pending,
          isEmailVerified: true,
        });
        if (!user) {
          resp.error = true;
          resp.error_message = 'Failed to register passenger';
          return resp;
        }

        const uniqueId = generateUniqueId(user.roles[0], user._id);
        const passenger = await createPassengerProfile(user._id, uniqueId);
        if (!passenger) {
          resp.error = true;
          resp.error_message = 'Failed to create passenger profile';
          return resp;
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

        const notify = await createAdminNotification({
          title: 'New Passenger Registered',
          message: `${user.name} registered as passenger successfully with email: ${user.email}`,
          metadata: user,
          module: 'passenger_management',
          type: 'ALERT',
          actionLink: `${env.FRONTEND_URL}/api/admin/passengers/fetch-passenger/${passenger._id}`,
        });
        if (!notify) {
          console.error('Failed to send notification');
        }

        // Welcome email should be best-effort only.
        // Even if SMTP / credentials fail, user must stay verified and API should succeed.
        try {
          await sendWelcomePassengerEmail(user.email, user.name);
        } catch (welcomeError) {
          console.error(
            '⚠️ Failed to send welcome email after successful passenger verification:',
            welcomeError.message || welcomeError,
          );
        }

        // Final cleanup
        await redisConfig.del(
          emailOtpKey(email),
          emailCooldownKey(email),
          emailPendingKey(email),
        );

        resp.data = {
          verifyPhone: true,
          message: `Phone Number verification is required. Please verify your phone number to complete the login process.`,
          email: user.email,
        };
        return resp;
      } else if (phoneNumber && otp) {
        const result = await verifyPhoneOtp(phoneNumber, otp);
        if (!result.ok) {
          resp.error = true;
          resp.error_message =
            result.reason === 'expired_or_not_requested'
              ? 'OTP expired or not requested'
              : 'Invalid OTP';
          return resp;
        }

        user = await createUser({
          ...result.pending,
          isPhoneVerified: true,
        });
        if (!user) {
          resp.error = true;
          resp.error_message = 'Failed to register passenger';
          return resp;
        }

        const uniqueId = generateUniqueId(user.roles[0], user._id);
        const passenger = await createPassengerProfile(user._id, uniqueId);
        if (!passenger) {
          resp.error = true;
          resp.error_message = 'Failed to create passenger profile';
          return resp;
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

        const notify = await createAdminNotification({
          title: 'New Passenger Registered',
          message: `${user.name} registered as passenger successfully with Phone Number: ${user.phoneNumber}`,
          metadata: user,
          module: 'passenger_management',
          type: 'ALERT',
          actionLink: `${env.FRONTEND_URL}/api/admin/passengers/fetch-passenger/${passenger._id}`,
        });
        if (!notify) {
          console.error('Failed to send notification');
        }

        // Final cleanup
        await redisConfig.del(
          phoneOtpKey(phoneNumber),
          phoneCooldownKey(phoneNumber),
          phonePendingKey(phoneNumber),
        );

        resp.data = {
          verifyEmail: true,
          message: `Email verification is required. Please verify your Email to complete the login process.`,
          phoneNumber: user.phoneNumber,
        };
        return resp;
      } else {
        resp.error = true;
        resp.error_message = 'Unexpected Error Occured';
        return resp;
      }
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
      if (!user || !user.roles.includes('passenger')) {
        resp.error = true;
        resp.error_message = 'Passenger not found';
        return resp;
      } else if (!user.phoneNumber || !user.isPhoneVerified) {
        resp.data = {
          verifyPhone: true,
          message: `Phone Number verification is required. Please verify your phone number to complete the login process.`,
          email: email,
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

      const passenger = await updatePassenger(
        { userId: user._id },
        { isActive: true },
      );
      if (!passenger) {
        resp.error = true;
        resp.error_message = 'Failed to activate passenger';
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
      const userDevice = await createDeviceInfo(device);
      if (!userDevice) {
        console.error('Failed to create user device');
      }

      const payload = { id: user._id, roles: user.roles };
      resp.data = {
        user: user,
        accessToken: generateAccessToken(payload),
        refreshToken: generateRefreshToken(payload),
      };
      return resp;
    } else if (phoneOtp) {
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
      if (!user || !user.roles.includes('passenger')) {
        resp.error = true;
        resp.error_message = 'Passenger not found';
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

      const passenger = await updatePassenger(
        { userId: user._id },
        { isActive: true },
      );
      if (!passenger) {
        resp.error = true;
        resp.error_message = 'Failed to activate passenger';
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
      const userDevice = await createDeviceInfo(device);
      if (!userDevice) {
        console.error('Failed to create user device');
      }

      const payload = { id: user._id, roles: user.roles };
      resp.data = {
        user: user,
        accessToken: generateAccessToken(payload),
        refreshToken: generateRefreshToken(payload),
      };
      return resp;
    } else if (verifyPhoneNumberOtp) {
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
      if (user && user.roles.includes('passenger') && user.isPhoneVerified) {
        resp.error = true;
        resp.error_message = 'Phone Number already exists';
        return resp;
      }

      user = await findUserByEmail(result.pending?.email);
      if (!user || !user.roles.includes('passenger')) {
        resp.error = true;
        resp.error_message = 'Passenger not found';
        return resp;
      }

      user = await updateUserById(user._id, {
        phoneNumber: result.pending?.phoneNumber,
        isPhoneVerified: true,
        isCompleted: true,
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
      const userDevice = await createDeviceInfo(device);
      if (!userDevice) {
        console.error('Failed to create user device');
      }

      const payload = { id: user._id, roles: user.roles };
      resp.data = {
        user: user,
        accessToken: generateAccessToken(payload),
        refreshToken: generateRefreshToken(payload),
      };
      return resp;
    } else if (verifyUserEmailOtp) {
      if (!email || !otp) {
        resp.error = true;
        resp.error_message = 'Email and OTP are required';
        return resp;
      }

      const result = await verifyEmailOtp(email, otp);
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

      user = await findUserByEmail(email);
      if (user && user.roles.includes('passenger') && user.isPhoneVerified) {
        resp.error = true;
        resp.error_message = 'Phone Number already exists';
        return resp;
      }

      user = await findUserByPhone(result.pending?.phoneNumber);
      if (!user || !user.roles.includes('passenger')) {
        resp.error = true;
        resp.error_message = 'Passenger not found';
        return resp;
      }

      user = await updateUserById(user._id, {
        email: result.pending?.email,
        isEmailVerified: true,
        isCompleted: true,
        userDeviceType,
      });
      if (!user) {
        resp.error = true;
        resp.error_message = 'Failed to verify email';
        return resp;
      }

      await redisConfig.del(
        emailOtpKey(email),
        emailCooldownKey(email),
        emailPendingKey(email),
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
        loginMethod: 'email',
        lastLoginAt: new Date(),
      };
      const userDevice = await createDeviceInfo(device);
      if (!userDevice) {
        console.error('Failed to create user device');
      }

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
      if (!user || !user.roles.includes('passenger')) {
        resp.error = true;
        resp.error_message = 'Passenger not found';
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
      if (!user || !user.roles.includes('passenger')) {
        resp.error = true;
        resp.error_message = 'Passenger not found';
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

export const sendPassengerPhoneOtp = async (
  { verifyPhone, email, phoneNumber },
  resp,
) => {
  try {
    console.log('📱 [SEND PHONE OTP] Request received:', {
      verifyPhone,
      email,
      phoneNumber: phoneNumber ? `${phoneNumber.slice(0, 3)}***${phoneNumber.slice(-4)}` : undefined,
    });

    if (verifyPhone) {
      if (!phoneNumber || !email) {
        console.log('❌ [SEND PHONE OTP] Missing required fields - phoneNumber or email');
        resp.error = true;
        resp.error_message = 'Phone number and email is required';
        return resp;
      }

      console.log('📱 [SEND PHONE OTP] Looking up user by email:', email);
      const user = await findUserByEmail(email);
      if (!user || !user.roles.includes('passenger')) {
        console.log('❌ [SEND PHONE OTP] User not found or not a passenger');
        resp.error = true;
        resp.error_message = 'User not found';
        return resp;
      }
      console.log('✅ [SEND PHONE OTP] User found:', user._id, user.name);

      if (user.phoneNumber && user.isPhoneVerified) {
        console.log('❌ [SEND PHONE OTP] Phone number already verified for user');
        resp.error = true;
        resp.error_message = 'Phone Number is already verified';
        return resp;
      }

      console.log('📱 [SEND PHONE OTP] Checking if phone number already exists:', phoneNumber);
      const exists = await findUserByPhone(phoneNumber);
      if (exists && exists.phoneNumber && exists.isPhoneVerified) {
        console.log('❌ [SEND PHONE OTP] Phone number already exists and verified');
        resp.error = true;
        resp.error_message = 'Phone Number already exists';
        return resp;
      }
      console.log('✅ [SEND PHONE OTP] Phone number is available');

      console.log('📱 [SEND PHONE OTP] Requesting phone OTP to:', phoneNumber);
      const result = await requestPhoneOtp(phoneNumber, user.name, {
        email: user.email,
        phoneNumber,
      });
      if (!result.ok) {
        console.log('❌ [SEND PHONE OTP] Failed to request OTP:', result);
        resp.error = true;
        resp.error_message = `Failed to send OTP. Please wait ${result.waitSeconds || 60}s`;
        return resp;
      }
      console.log('✅ [SEND PHONE OTP] Phone OTP requested successfully');

      // Notification email is best-effort only; OTP via SMS is the primary flow.
      // Even if email fails (e.g., SMTP credentials issue), API should still succeed.
      try {
        console.log(
          '📧 [SEND PHONE OTP] Sending notification email to:',
          user.email,
        );
        await sendPhoneOtpEmail(user.email, user.name, phoneNumber.slice(-4));
        console.log(
          '✅ [SEND PHONE OTP] Notification email sent successfully',
        );
      } catch (emailError) {
        console.error(
          '⚠️ [SEND PHONE OTP] Failed to send notification email:',
          emailError.message || emailError,
        );
      }

      resp.data = {
        verifyPhoneNumberOtp: true,
        message: `Phone Number verification OTP has been sent to ${phoneNumber}`,
        phoneNumber: phoneNumber,
      };
      console.log('✅ [SEND PHONE OTP] Response sent successfully');
      return resp;
    } else {
      console.log('❌ [SEND PHONE OTP] verifyPhone flag not set');
      resp.error = true;
      resp.error_message = 'verifyPhone flag is required';
      return resp;
    }
  } catch (error) {
    console.error(`❌ [SEND PHONE OTP] API ERROR:`, error);
    resp.error = true;
    resp.error_message = error.message || 'Something went wrong';
    return resp;
  }
};

export const sendPassengerEmailOtp = async (
  { verifyEmail, email, phoneNumber },
  resp,
) => {
  try {
    if (verifyEmail) {
      if (!phoneNumber || !email) {
        resp.error = true;
        resp.error_message = 'Phone number and email is required';
        return resp;
      }
      const user = await findUserByPhone(phoneNumber);
      if (!user || !user.roles.includes('passenger')) {
        resp.error = true;
        resp.error_message = 'User not found';
        return resp;
      } else if (user.email && user.isEmailVerified) {
        resp.error = true;
        resp.error_message = 'Email is already verified';
        return resp;
      }

      const exists = await findUserByEmail(email);
      if (exists && exists.email && exists.isEmailVerified) {
        resp.error = true;
        resp.error_message = 'Email already exists';
        return resp;
      }

      const result = await requestEmailOtp(
        email,
        user.name,
        {
          phoneNumber: user.phoneNumber,
          email,
        },
        'otp',
        'passenger',
      );
      if (!result.ok) {
        resp.error = true;
        resp.error_message = `Failed to send OTP. Please wait ${result.waitSeconds || 60}s`;
        return resp;
      }

      resp.data = {
        verifyUserEmailOtp: true,
        message: `Email verification OTP has been sent to ${email}`,
        email: email,
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
        resp.error_message = 'No user found';
        return resp;
      } else if (!user.roles.includes('passenger')) {
        resp.error = true;
        resp.error_message = 'No passenger found with this email';
        return resp;
      } else if (!user.isEmailVerified) {
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
        resp.error_message = 'No user found';
        return resp;
      } else if (!user.roles.includes('passenger')) {
        resp.error = true;
        resp.error_message = 'No passenger found with this phone number';
        return resp;
      } else if (!user.isPhoneVerified) {
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
    if (!resetSessionToken || !newPassword) {
      resp.error = true;
      resp.error_message = 'session token, and new password are required';
      return resp;
    }

    let user;
    if (email) {
      user = await findUserByEmail(email);
      if (!user) {
        resp.error = true;
        resp.error_message = 'No user found';
        return resp;
      } else if (!user.roles.includes('passenger')) {
        resp.error = true;
        resp.error_message = 'No passenger found with this email';
        return resp;
      } else if (!user.isEmailVerified) {
        resp.error = true;
        resp.error_message = 'Email is not verified';
        return resp;
      }
    } else if (phoneNumber) {
      user = await findUserByPhone(phoneNumber);
      if (!user) {
        resp.error = true;
        resp.error_message = 'No user found for that phone number';
        return resp;
      } else if (!user.roles.includes('passenger')) {
        resp.error = true;
        resp.error_message = 'No passenger found with this email';
        return resp;
      } else if (!user.isPhoneVerified) {
        resp.error = true;
        resp.error_message = 'Phone number is not verified';
        return resp;
      }
    } else {
      resp.error = true;
      resp.error_message = 'Unauthorized access';
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
  { emailOtp, phoneOtp, signupOtp, email, phoneNumber } = {},
  resp,
) => {
  try {
    console.log('🔄 [RESEND OTP] Request received:', {
      emailOtp,
      phoneOtp,
      signupOtp,
      email,
      phoneNumber: phoneNumber ? `${phoneNumber.slice(0, 3)}***${phoneNumber.slice(-4)}` : undefined,
    });

    if (!resp) {
      console.error('❌ [RESEND OTP] resp parameter is undefined');
      return { error: true, error_message: 'Internal server error', auth: false, data: {} };
    }

    // Handle signupOtp - directly check Redis for pending signup (user doesn't exist yet)
    if (signupOtp && email) {
      console.log('📧 [RESEND OTP] signupOtp detected with email:', email);
      console.log('📧 [RESEND OTP] Checking Redis for pending signup data');
      
      // For signup flow, directly check Redis (user doesn't exist in DB yet)
      const pendingRaw = await redisConfig.get(emailPendingKey(email));
      if (!pendingRaw) {
        console.log('❌ [RESEND OTP] No pending signup found in Redis for email:', email);
        resp.error = true;
        resp.error_message =
          'No pending signup exists for this email. Please start the signup process again.';
        return resp;
      }

      console.log('✅ [RESEND OTP] Pending signup data found in Redis');
      const pending = JSON.parse(pendingRaw);
      console.log('📧 [RESEND OTP] Pending data:', JSON.stringify(pending, null, 2));
      const username = pending.name || 'User';

      console.log('📧 [RESEND OTP] Requesting new OTP for signup');
      const result = await requestEmailOtp(
        email,
        username,
        pending,
        'signup',
        'passenger',
      );
      if (!result.ok) {
        console.log('❌ [RESEND OTP] Failed to request OTP:', result);
        resp.error = true;
        resp.error_message = `Failed to send OTP. Please wait ${
          result.waitSeconds || 60
        }s`;
        return resp;
      }

      console.log('✅ [RESEND OTP] Signup OTP resent successfully to:', email);
      resp.data = {
        signupOtp: true,
        message: `Signup OTP has been resent to ${email}`,
        email,
      };
      return resp;
    } else if (signupOtp && phoneNumber) {
      console.log('📱 [RESEND OTP] signupOtp detected with phoneNumber:', phoneNumber);
      console.log('📱 [RESEND OTP] Checking Redis for pending signup data');
      
      // For signup flow, directly check Redis (user doesn't exist in DB yet)
      const pendingRaw = await redisConfig.get(phonePendingKey(phoneNumber));
      if (!pendingRaw) {
        console.log('❌ [RESEND OTP] No pending signup found in Redis for phone:', phoneNumber);
        resp.error = true;
        resp.error_message =
          'No pending signup exists for this phone number. Please start the signup process again.';
        return resp;
      }

      console.log('✅ [RESEND OTP] Pending signup data found in Redis');
      const pending = JSON.parse(pendingRaw);
      console.log('📱 [RESEND OTP] Pending data:', JSON.stringify(pending, null, 2));
      const username = pending.name || 'User';

      console.log('📱 [RESEND OTP] Requesting new OTP for signup');
      const result = await requestPhoneOtp(
        phoneNumber,
        username,
        pending,
        'signup',
        'passenger',
      );
      if (!result.ok) {
        console.log('❌ [RESEND OTP] Failed to request OTP:', result);
        resp.error = true;
        resp.error_message = `Failed to send OTP. Please wait ${
          result.waitSeconds || 60
        }s`;
        return resp;
      }

      console.log('✅ [RESEND OTP] Signup OTP resent successfully to:', phoneNumber);
      resp.data = {
        signupOtp: true,
        message: `Signup OTP has been resent to ${phoneNumber}`,
        phoneNumber,
      };
      return resp;
    }

    if (emailOtp) {
      // 1) Try existing user (login / post-signup flows)
      console.log('📧 [RESEND OTP] Processing emailOtp (verification flow)');
      let user = await findUserByEmail(email);
      console.log('📧 [RESEND OTP] User lookup result:', user ? `Found user ${user._id}` : 'User not found');

      if (user) {
        if (!user.roles.includes('passenger')) {
          resp.error = true;
          resp.error_message = 'No passenger found with this email';
          return resp;
        } else if (!user.isEmailVerified) {
          resp.error = true;
          resp.error_message = 'Email is not verified';
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
          resp.error_message = `Failed to send OTP. Please wait ${
            result.waitSeconds || 60
          }s`;
          return resp;
        }

        resp.data = {
          emailOtp: true,
          message: `OTP has been sent to ${user.email}`,
          email: user.email,
        };
        return resp;
      }

      // 2) If user not found, check pending signup context in Redis (email signup OTP resend)
      console.log('📧 [RESEND OTP] User not found, checking Redis for pending data');
      const pendingRaw = await redisConfig.get(emailPendingKey(email));
      if (!pendingRaw) {
        console.log('❌ [RESEND OTP] No pending data found in Redis');
        resp.error = true;
        resp.error_message =
          'User not found and no pending signup exists for this email';
        return resp;
      }

      console.log('✅ [RESEND OTP] Pending data found in Redis');
      const pending = JSON.parse(pendingRaw);
      const username = pending.name || 'User';

      const result = await requestEmailOtp(
        email,
        username,
        pending,
        'signup',
        'passenger',
      );
      if (!result.ok) {
        resp.error = true;
        resp.error_message = `Failed to send OTP. Please wait ${
          result.waitSeconds || 60
        }s`;
        return resp;
      }

      resp.data = {
        emailOtp: true,
        message: `Signup OTP has been resent to ${email}`,
        email,
      };
      return resp;
    } else if (phoneOtp) {
      console.log('📱 [RESEND OTP] Processing phoneOtp resend for:', phoneNumber);
      // 1) Try existing user (login / post-signup flows)
      let user = await findUserByPhone(phoneNumber);
      console.log('📱 [RESEND OTP] User lookup result:', user ? `Found user ${user._id}` : 'User not found');

      if (user) {
        console.log('📱 [RESEND OTP] User exists, checking role and verification status');
        if (!user.roles.includes('passenger')) {
          console.log('❌ [RESEND OTP] User is not a passenger');
          resp.error = true;
          resp.error_message = 'No passenger found with this phone number';
          return resp;
        } else if (!user.isPhoneVerified) {
          console.log('❌ [RESEND OTP] User phone number is not verified');
          resp.error = true;
          resp.error_message = 'Phone number is not verified';
          return resp;
        }

        console.log('📱 [RESEND OTP] Resending OTP to existing user');
        const result = await resendPhoneOtp(user.phoneNumber, user.name);
        if (!result.ok) {
          console.log('❌ [RESEND OTP] Failed to resend OTP:', result);
          resp.error = true;
          resp.error_message = `Failed to send OTP. Please wait ${result.waitSeconds || 60}s`;
          return resp;
        }

        console.log('✅ [RESEND OTP] OTP resent successfully to existing user');
        resp.data = {
          phoneOtp: true,
          message: `OTP has been sent to ${user.phoneNumber}`,
          phoneNumber: user.phoneNumber,
        };
        return resp;
      }

      // 2) If user not found, check pending signup context in Redis (phone signup OTP resend)
      console.log('📱 [RESEND OTP] User not found, checking Redis for pending signup');
      const pendingKey = phonePendingKey(phoneNumber);
      console.log('📱 [RESEND OTP] Redis key:', pendingKey);
      const pendingRaw = await redisConfig.get(pendingKey);
      
      if (!pendingRaw) {
        console.log('❌ [RESEND OTP] No pending signup found in Redis');
        resp.error = true;
        resp.error_message =
          'User not found and no pending signup exists for this phone number';
        return resp;
      }

      console.log('✅ [RESEND OTP] Pending signup found in Redis');
      const pending = JSON.parse(pendingRaw);
      console.log('📱 [RESEND OTP] Pending data:', JSON.stringify(pending, null, 2));
      const username = pending.name || 'User';

      console.log('📱 [RESEND OTP] Requesting new OTP for signup');
      const result = await requestPhoneOtp(
        phoneNumber,
        username,
        pending,
        'signup',
        'passenger',
      );
      if (!result.ok) {
        console.log('❌ [RESEND OTP] Failed to request OTP:', result);
        resp.error = true;
        resp.error_message = `Failed to send OTP. Please wait ${
          result.waitSeconds || 60
        }s`;
        return resp;
      }

      console.log('✅ [RESEND OTP] Signup OTP resent successfully to:', phoneNumber);
      resp.data = {
        phoneOtp: true,
        message: `Signup OTP has been resent to ${phoneNumber}`,
        phoneNumber,
      };
      return resp;
    } else {
      resp.error = true;
      resp.error_message = 'Either emailOtp, phoneOtp, or signupOtp (with email or phoneNumber) must be provided';
      return resp;
    }
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'Something went wrong';
    return resp;
  }
};

export const refreshAuthToken = async ({ refreshToken }, resp) => {
  const payload = verifyRefreshToken(refreshToken);
  if (!payload) {
    resp.error = true;
    resp.error_message = 'Invalid refresh token';
    return resp;
  } else if (!payload.roles.includes('passenger')) {
    resp.error = true;
    resp.error_message = 'Unauthorized Access';
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

export const updateFCMToken = async (user, { userDeviceToken }, resp) => {
  try {
    if (user.roles.includes('passenger')) {
      const success = await updateUserById(user._id, {
        userDeviceToken,
      });
      if (!success) {
        resp.error = true;
        resp.error_message = 'Failed to update Device Token';
        return resp;
      }

      resp.data = success;
      return resp;
    } else {
      resp.error = true;
      resp.error_message = 'Unauthorized Access';
      return resp;
    }
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'something went wrong';
    return resp;
  }
};
