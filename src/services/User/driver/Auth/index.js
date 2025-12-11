import {
  hashPassword,
  comparePasswords,
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  generateUniqueId,
  verifyBiometricLogin,
} from '../../../../utils/auth.js';
import {
  findUserByEmail,
  findUserByPhone,
  createUser,
  updateUserById,
} from '../../../../dal/user/index.js';
import {
  createDriverProfile,
  findDriverByUserId,
  createDriverLocation,
} from '../../../../dal/driver.js';
import {
  createDriverStripeAccount,
  createDriverWallet,
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
  sendDriverResetPasswordEmail,
  sendWelcomeDriverEmail,
} from '../../../../templates/emails/user/index.js';
import {
  validateDriverSignup,
  validateDriverPhoneSignup,
} from '../../../../validations/user/authValidations.js';
import { verifyGoogleToken } from '../../../../utils/verifySocials.js';

export const signUpDriverWithEmail = async (
  { name, email, gender, password, confirmPassword },
  resp,
) => {
  try {
    const validation = validateDriverSignup({
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
      // If user exists but email not verified, allow resending OTP
      if (user.isEmailVerified) {
        resp.error = true;
        resp.error_message = 'Email already in use';
        return resp;
      }
      // User exists but not verified - update and resend OTP
      console.log('📝 [DRIVER SIGNUP] User exists but not verified, updating...');
      user = await updateUserById(user._id, {
        name,
        email,
        gender,
        password: hashed,
        roles: ['driver'],
        isEmailVerified: false,
      });
    } else {
      // Create new user in DB (email not verified yet)
      console.log('💾 [DRIVER SIGNUP] Creating user in database (email not verified)...');
      user = await createUser({
        name,
        email,
        gender,
        roles: ['driver'],
        password: hashed,
        isEmailVerified: false,
      });
      
      if (!user) {
        console.error('❌ [DRIVER SIGNUP] Failed to create user in database');
        resp.error = true;
        resp.error_message = 'Failed to create user account';
        return resp;
      }
      
      console.log('✅ [DRIVER SIGNUP] User created in database:', {
        userId: user._id,
        email: user.email,
        name: user.name,
        isEmailVerified: user.isEmailVerified,
      });
    }

    // Store minimal context in Redis for OTP verification (just for reference)
    const userData = {
      userId: user._id.toString(),
      email: user.email,
    };

    console.log('📝 [DRIVER SIGNUP] Requesting OTP for user:', user._id);
    const result = await requestEmailOtp(
      email,
      name,
      userData,
      'signup',
      'driver',
    );
    
    console.log('📝 [DRIVER SIGNUP] OTP request result:', result);
    if (!result.ok) {
      resp.error = true;
      resp.error_message = `Failed to send OTP. Please wait ${result.waitSeconds || 60}s`;
      return resp;
    }

    resp.data = {
      signupOtp: true,
      message: `Email verification OTP to register driver has been sent to ${email}`,
      email: email,
    };
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'Something went wrong';
    return resp;
  }
};

export const signUpDriverWithPhone = async (
  { name, phoneNumber, gender, password, confirmPassword },
  resp,
) => {
  try {
    const validation = validateDriverPhoneSignup({
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
      roles: ['driver'],
      password: hashed,
    };

    const result = await requestPhoneOtp(
      phoneNumber,
      name,
      userData,
      'signup',
      'driver',
    );
    if (!result.ok) {
      resp.error = true;
      resp.error_message = `Failed to send OTP. Please wait ${result.waitSeconds || 60}s`;
      return resp;
    }

    resp.data = {
      signupOtp: true,
      message: `Phone number verification OTP to register driver has been sent to ${phoneNumber}`,
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
      } else if (!user.roles.includes('driver') || !user.isEmailVerified) {
        resp.error = true;
        resp.error_message = `Only verified drivers can login here`;
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
          'login',
          'driver',
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
      } else if (!user.roles.includes('driver') || !user.isPhoneVerified) {
        resp.error = true;
        resp.error_message = `Only verified drivers can login here`;
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
        roles: ['driver'],
        userSocialToken,
        userSocialProvider,
      });

      const uniqueId = generateUniqueId(user.roles[0], user._id);

      let driver = await createDriverProfile(user._id, uniqueId);
      if (!driver) {
        resp.error = true;
        resp.error_message = 'Failed to create driver';
        return resp;
      }

      driver = await findDriverByUserId(user._id);
      if (!driver) {
        resp.error = true;
        resp.error_message = 'Driver not found';
        return resp;
      }

      const stripeCustomerId = await createDriverStripeAccount(user, driver);
      if (!stripeCustomerId) {
        resp.error = true;
        resp.error_message = 'Failed to create stripe account';
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
        actionLink: `${env.FRONTEND_URL}/api/admin/drivers/fetch/${driver._id}`,
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

      let driver = await findDriverByUserId(user._id);
      if (!driver) {
        resp.error = true;
        resp.error_message = 'Driver not found';
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
      const accessToken = generateAccessToken(payload);
      const refreshToken = generateRefreshToken(payload);
      
      // Log active driver login with role and token
      console.log('🔐 [ACTIVE] DRIVER LOGIN (Social):', {
        userId: user._id,
        role: 'driver',
        name: user.name,
        email: user.email,
        phoneNumber: user.phoneNumber,
        accessToken: accessToken,
        refreshToken: refreshToken,
        timestamp: new Date().toISOString(),
      });
      
      resp.data = {
        success: true,
        message: 'Social login successful',
        user,
        accessToken,
        refreshToken,
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
    console.log('🔄 [DRIVER OTP VERIFY] Request received:', {
      signupOtp,
      phoneOtp,
      emailOtp,
      verifyPhoneNumberOtp,
      verifyUserEmailOtp,
      forgotPasswordPhoneOtp,
      forgotPasswordEmailOtp,
      phoneNumber: phoneNumber ? `${phoneNumber.slice(0, 3)}***${phoneNumber.slice(-4)}` : undefined,
      email,
      hasOtp: !!otp,
    });
    
    let user;
    if (signupOtp) {
      if (email && otp) {
        console.log('✅ [DRIVER OTP VERIFY] Verifying email OTP for signup:', email);
        const result = await verifyEmailOtp(email, otp);
        console.log('✅ [DRIVER OTP VERIFY] OTP verification result:', {
          ok: result.ok,
          reason: result.reason,
          hasPending: !!result.pending,
        });
        
        if (!result.ok) {
          resp.error = true;
          resp.error_message =
            result.reason === 'expired_or_not_requested'
              ? 'OTP expired or not requested'
              : 'Invalid OTP';
          return resp;
        }

        // Find existing user (created during signup)
        console.log('🔍 [DRIVER OTP VERIFY] Finding user in database...');
        user = await findUserByEmail(email);
        
        if (!user) {
          console.error('❌ [DRIVER OTP VERIFY] User not found in database!');
          resp.error = true;
          resp.error_message = 'User not found. Please try signing up again.';
          return resp;
        }

        if (user.isEmailVerified) {
          console.log('⚠️ [DRIVER OTP VERIFY] User email already verified');
          resp.error = true;
          resp.error_message = 'Email is already verified';
          return resp;
        }

        // Update user to mark email as verified
        console.log('💾 [DRIVER OTP VERIFY] Updating user email verification status...');
        user = await updateUserById(user._id, {
          isEmailVerified: true,
        });
        
        if (!user) {
          console.error('❌ [DRIVER OTP VERIFY] Failed to update user');
          resp.error = true;
          resp.error_message = 'Failed to verify email';
          return resp;
        }
        
        console.log('✅ [DRIVER OTP VERIFY] User email verified successfully:', {
          userId: user._id,
          email: user.email,
          name: user.name,
        });

        const uniqueId = generateUniqueId(user.roles[0], user._id);
        const driver = await createDriverProfile(user._id, uniqueId);
        if (!driver) {
          resp.error = true;
          resp.error_message = 'Failed to create driver profile';
          return resp;
        }

        const stripeCustomerId = await createDriverStripeAccount(user, driver);
        if (!stripeCustomerId) {
          resp.error = true;
          resp.error_message = 'Failed to create stripe account';
          return resp;
        }

        const wallet = await createDriverWallet(driver._id);
        if (!wallet) {
          resp.error = true;
          resp.error_message = 'Failed to create In-App wallet';
          return resp;
        }

        const driverLocation = await createDriverLocation(driver._id);
        if (!driverLocation) {
          resp.error = true;
          resp.error_message = 'Failed to create driver location';
          return resp;
        }

        const notify = await createAdminNotification({
          title: 'New Driver Registered',
          message: `${user.name} registered as driver successfully with email: ${user.email}`,
          metadata: user,
          module: 'driver_management',
          type: 'ALERT',
          actionLink: `${env.FRONTEND_URL}/api/admin/drivers/fetch/${driver._id}`,
        });
        if (!notify) {
          console.error('Failed to send notification');
        }

        await sendWelcomeDriverEmail(user.email, user.name);

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
          resp.error_message = 'Failed to register driver';
          return resp;
        }

        const uniqueId = generateUniqueId(user.roles[0], user._id);
        const driver = await createDriverProfile(user._id, uniqueId);
        if (!driver) {
          resp.error = true;
          resp.error_message = 'Failed to create driver profile';
          return resp;
        }

        const stripeCustomerId = await createDriverStripeAccount(user, driver);
        if (!stripeCustomerId) {
          resp.error = true;
          resp.error_message = 'Failed to create stripe account';
          return resp;
        }

        const wallet = await createDriverWallet(driver._id);
        if (!wallet) {
          resp.error = true;
          resp.error_message = 'Failed to create In-App wallet';
          return resp;
        }

        const driverLocation = await createDriverLocation(driver._id);
        if (!driverLocation) {
          resp.error = true;
          resp.error_message = 'Failed to create driver location';
          return resp;
        }

        const notify = await createAdminNotification({
          title: 'New Driver Registered',
          message: `${user.name} registered as driver successfully with Phone Number: ${user.phoneNumber}`,
          metadata: user,
          module: 'driver_management',
          type: 'ALERT',
          actionLink: `${env.FRONTEND_URL}/api/admin/drivers/fetch/${driver._id}`,
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
          message: `Email verification is required. Please verify your phone number to complete the login process.`,
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
      if (!user || !user.roles.includes('driver')) {
        resp.error = true;
        resp.error_message = 'Driver not found';
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

      const driver = await findDriverByUserId(user._id);
      if (!driver) {
        resp.error = true;
        resp.error_message = 'Driver not found';
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
      const accessToken = generateAccessToken(payload);
      const refreshToken = generateRefreshToken(payload);
      
      // Log active driver login with role and token
      console.log('🔐 [ACTIVE] DRIVER LOGIN (Email OTP):', {
        userId: user._id,
        role: 'driver',
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
      if (!user || !user.roles.includes('driver')) {
        resp.error = true;
        resp.error_message = 'Driver not found';
        return resp;
      } else if (!user.email || !user.isEmailVerified) {
        resp.data = {
          verifyEmail: true,
          message: `Email verification is required. Please verify your email to complete the login process.`,
          phoneNumber: phoneNumber,
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

      await redisConfig.del(
        phoneOtpKey(phoneNumber),
        phoneCooldownKey(phoneNumber),
        phonePendingKey(phoneNumber),
      );

      const driver = await findDriverByUserId(user._id);
      if (!driver) {
        resp.error = true;
        resp.error_message = 'Driver not found';
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
      const accessToken = generateAccessToken(payload);
      const refreshToken = generateRefreshToken(payload);
      
      // Log active driver login with role and token
      console.log('🔐 [ACTIVE] DRIVER LOGIN (Phone OTP):', {
        userId: user._id,
        role: 'driver',
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
    } else if (verifyPhoneNumberOtp) {
      console.log('📱 [DRIVER PHONE VERIFY] Verifying phone number OTP:', phoneNumber);
      if (!phoneNumber || !otp) {
        resp.error = true;
        resp.error_message = 'Phone number and OTP are required';
        return resp;
      }

      console.log('📱 [DRIVER PHONE VERIFY] Verifying OTP...');
      const result = await verifyPhoneOtp(phoneNumber, otp);
      console.log('📱 [DRIVER PHONE VERIFY] OTP verification result:', {
        ok: result.ok,
        reason: result.reason,
        hasPending: !!result.pending,
      });
      
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

      if (!result.pending || !result.pending.email) {
        console.error('❌ [DRIVER PHONE VERIFY] No pending data or email in result');
        resp.error = true;
        resp.error_message = 'Phone verification data not found. Please try again.';
        return resp;
      }

      console.log('📱 [DRIVER PHONE VERIFY] Pending data:', result.pending);
      
      // Check if phone number already exists and is verified
      user = await findUserByPhone(phoneNumber);
      if (user && user.roles.includes('driver') && user.isPhoneVerified) {
        console.log('❌ [DRIVER PHONE VERIFY] Phone number already exists and verified');
        resp.error = true;
        resp.error_message = 'Phone Number already exists';
        return resp;
      }

      // Find user by email from pending data
      console.log('🔍 [DRIVER PHONE VERIFY] Finding user by email:', result.pending.email);
      user = await findUserByEmail(result.pending.email);
      if (!user || !user.roles.includes('driver')) {
        console.error('❌ [DRIVER PHONE VERIFY] User not found or not a driver');
        resp.error = true;
        resp.error_message = 'Driver not found';
        return resp;
      }

      console.log('✅ [DRIVER PHONE VERIFY] User found:', user._id);
      console.log('💾 [DRIVER PHONE VERIFY] Updating user with phone number...');
      user = await updateUserById(user._id, {
        phoneNumber: result.pending?.phoneNumber || phoneNumber,
        isPhoneVerified: true,
        isCompleted: true,
        userDeviceType,
      });
      if (!user) {
        console.error('❌ [DRIVER PHONE VERIFY] Failed to update user');
        resp.error = true;
        resp.error_message = 'Failed to verify phone number';
        return resp;
      }

      console.log('✅ [DRIVER PHONE VERIFY] Phone number verified successfully:', {
        userId: user._id,
        email: user.email,
        phoneNumber: user.phoneNumber,
      });

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
      if (user && user.roles.includes('driver') && user.isEmailVerified) {
        resp.error = true;
        resp.error_message = 'Email already exists';
        return resp;
      }

      user = await findUserByPhone(result.pending?.phoneNumber);
      if (!user || !user.roles.includes('driver')) {
        console.error('❌ [DRIVER EMAIL VERIFY] User not found or not a driver');
        resp.error = true;
        resp.error_message = 'Driver not found';
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
      if (!user || !user.roles.includes('driver')) {
        resp.error = true;
        resp.error_message = 'Driver not found';
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
      if (!user || !user.roles.includes('driver')) {
        resp.error = true;
        resp.error_message = 'Driver not found';
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
      console.error('❌ [DRIVER OTP VERIFY] No valid OTP type flag provided');
      console.error('❌ [DRIVER OTP VERIFY] Received flags:', {
        signupOtp,
        phoneOtp,
        emailOtp,
        verifyPhoneNumberOtp,
        verifyUserEmailOtp,
        forgotPasswordPhoneOtp,
        forgotPasswordEmailOtp,
      });
      resp.error = true;
      resp.error_message = 'Invalid OTP Type. Please provide a valid OTP verification flag (signupOtp, emailOtp, phoneOtp, verifyPhoneNumberOtp, verifyUserEmailOtp, etc.)';
      return resp;
    }
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'Something went wrong';
    return resp;
  }
};

export const sendDriverPhoneOtp = async (
  { verifyPhone, email, phoneNumber },
  resp,
) => {
  try {
    if (verifyPhone) {
      if (!phoneNumber || !email) {
        resp.error = true;
        resp.error_message = 'Phone number and email is required';
        return resp;
      }
      const user = await findUserByEmail(email);
      if (!user || !user.roles.includes('driver')) {
        resp.error = true;
        resp.error_message = 'User not found';
        return resp;
      } else if (user.phoneNumber && user.isPhoneVerified) {
        resp.error = true;
        resp.error_message = 'Phone Number is already verified';
        return resp;
      }

      const exists = await findUserByPhone(phoneNumber);
      if (exists && exists.phoneNumber && exists.isPhoneVerified) {
        resp.error = true;
        resp.error_message = 'Phone Number already exists';
        return resp;
      }

      const result = await requestPhoneOtp(phoneNumber, user.name, {
        email: user.email,
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
        phoneNumber: phoneNumber,
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

export const sendDriverEmailOtp = async (
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
      if (!user || !user.roles.includes('driver')) {
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
        'driver',
      );
      console.log(result);
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
      } else if (!user.roles.includes('driver')) {
        resp.error = true;
        resp.error_message = 'No driver found with this email';
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
      } else if (!user.roles.includes('driver')) {
        resp.error = true;
        resp.error_message = 'No driver found with this phone number';
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

      await sendDriverResetPasswordEmail(
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
      } else if (!user.roles.includes('driver')) {
        resp.error = true;
        resp.error_message = 'No driver found with this email';
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
      } else if (!user.roles.includes('driver')) {
        resp.error = true;
        resp.error_message = 'No driver found with this email';
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
    console.log('🔄 [DRIVER RESEND OTP] Request received:', {
      emailOtp,
      phoneOtp,
      signupOtp,
      email,
      phoneNumber: phoneNumber ? `${phoneNumber.slice(0, 3)}***${phoneNumber.slice(-4)}` : undefined,
    });

    // Handle signupOtp - directly check for existing user (not verified)
    if (signupOtp && email) {
      console.log('📧 [DRIVER RESEND OTP] signupOtp detected with email:', email);
      console.log('🔍 [DRIVER RESEND OTP] Finding user in database...');
      
      let user = await findUserByEmail(email);
      if (!user) {
        console.log('❌ [DRIVER RESEND OTP] User not found in database');
        resp.error = true;
        resp.error_message = 'User not found. Please start the signup process again.';
        return resp;
      }

      if (!user.roles.includes('driver')) {
        console.log('❌ [DRIVER RESEND OTP] User is not a driver');
        resp.error = true;
        resp.error_message = 'No driver found with this email';
        return resp;
      }

      if (user.isEmailVerified) {
        console.log('⚠️ [DRIVER RESEND OTP] User email already verified');
        resp.error = true;
        resp.error_message = 'Email is already verified';
        return resp;
      }

      console.log('✅ [DRIVER RESEND OTP] User found, resending signup OTP');
      const userData = {
        userId: user._id.toString(),
        email: user.email,
      };
      
      const result = await requestEmailOtp(
        email,
        user.name,
        userData,
        'signup',
        'driver',
      );
      if (!result.ok) {
        console.log('❌ [DRIVER RESEND OTP] Failed to request OTP:', result);
        resp.error = true;
        resp.error_message = `Failed to send OTP. Please wait ${result.waitSeconds || 60}s`;
        return resp;
      }

      console.log('✅ [DRIVER RESEND OTP] Signup OTP resent successfully');
      resp.data = {
        signupOtp: true,
        message: `Signup OTP has been resent to ${email}`,
        email,
      };
      return resp;
    } else if (signupOtp && phoneNumber) {
      console.log('📱 [DRIVER RESEND OTP] signupOtp detected with phoneNumber:', phoneNumber);
      // Similar logic for phone signup
      let user = await findUserByPhone(phoneNumber);
      if (!user || !user.roles.includes('driver') || user.isPhoneVerified) {
        resp.error = true;
        resp.error_message = user?.isPhoneVerified 
          ? 'Phone number is already verified'
          : 'User not found. Please start the signup process again.';
        return resp;
      }

      const userData = {
        userId: user._id.toString(),
        phoneNumber: user.phoneNumber,
      };
      
      const result = await requestPhoneOtp(
        phoneNumber,
        user.name,
        userData,
        'signup',
        'driver',
      );
      if (!result.ok) {
        resp.error = true;
        resp.error_message = `Failed to send OTP. Please wait ${result.waitSeconds || 60}s`;
        return resp;
      }

      resp.data = {
        signupOtp: true,
        message: `Signup OTP has been resent to ${phoneNumber}`,
        phoneNumber,
      };
      return resp;
    }

    if (emailOtp) {
      let user = await findUserByEmail(email);
      if (!user) {
        resp.error = true;
        resp.error_message = `User not found`;
        return resp;
      } else if (!user.roles.includes('driver')) {
        resp.error = true;
        resp.error_message = 'No driver found with this email';
        return resp;
      } else if (user.isEmailVerified) {
        // User is verified - this is for login/verification flow
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
      } else {
        // User exists but email not verified - this is signup resend flow
        console.log('📧 [DRIVER RESEND OTP] User exists but email not verified, resending signup OTP');
        const userData = {
          userId: user._id.toString(),
          email: user.email,
        };
        
        const result = await requestEmailOtp(
          email,
          user.name,
          userData,
          'signup',
          'driver',
        );
        if (!result.ok) {
          resp.error = true;
          resp.error_message = `Failed to send OTP. Please wait ${result.waitSeconds || 60}s`;
          return resp;
        }

        resp.data = {
          signupOtp: true,
          message: `Signup OTP has been resent to ${email}`,
          email,
        };
        return resp;
      }
    } else if (phoneOtp) {
      console.log('📱 [DRIVER RESEND OTP] Processing phoneOtp resend for:', phoneNumber);
      let user = await findUserByPhone(phoneNumber);
      console.log('📱 [DRIVER RESEND OTP] User lookup by phone result:', user ? `Found user ${user._id}` : 'User not found');
      
      if (!user) {
        // User not found by phone - check Redis for pending phone verification OTP
        console.log('📱 [DRIVER RESEND OTP] User not found by phone, checking Redis for pending phone verification');
        const pendingKey = phonePendingKey(phoneNumber);
        console.log('📱 [DRIVER RESEND OTP] Redis key:', pendingKey);
        const pendingRaw = await redisConfig.get(pendingKey);
        
        if (pendingRaw) {
          console.log('✅ [DRIVER RESEND OTP] Pending phone verification found in Redis');
          const pending = JSON.parse(pendingRaw);
          console.log('📱 [DRIVER RESEND OTP] Pending data:', JSON.stringify(pending, null, 2));
          
          // Find user by email from pending data
          if (pending.email) {
            user = await findUserByEmail(pending.email);
            if (user && user.roles.includes('driver')) {
              console.log('✅ [DRIVER RESEND OTP] Found user by email from pending data:', user._id);
              
              // Resend phone verification OTP
              const result = await requestPhoneOtp(
                phoneNumber,
                user.name,
                {
                  email: user.email,
                  phoneNumber,
                },
                'update',
                'driver',
              );
              if (!result.ok) {
                console.log('❌ [DRIVER RESEND OTP] Failed to request OTP:', result);
                resp.error = true;
                resp.error_message = `Failed to send OTP. Please wait ${result.waitSeconds || 60}s`;
                return resp;
              }

              console.log('✅ [DRIVER RESEND OTP] Phone verification OTP resent successfully');
              resp.data = {
                phoneOtp: true,
                message: `Phone verification OTP has been resent to ${phoneNumber}`,
                phoneNumber,
              };
              return resp;
            }
          }
        }
        
        console.log('❌ [DRIVER RESEND OTP] User not found and no pending phone verification in Redis');
        resp.error = true;
        resp.error_message = `User not found. Please start the phone verification process again.`;
        return resp;
      } else if (!user.roles.includes('driver')) {
        console.log('❌ [DRIVER RESEND OTP] User is not a driver');
        resp.error = true;
        resp.error_message = 'No driver found with this phone number';
        return resp;
      } else if (!user.isPhoneVerified) {
        // Phone not verified - this is phone verification flow, resend verification OTP
        console.log('📱 [DRIVER RESEND OTP] User phone not verified, resending verification OTP');
        console.log('📱 [DRIVER RESEND OTP] User email:', user.email);
        
        if (!user.email) {
          resp.error = true;
          resp.error_message = 'Email is required for phone verification';
          return resp;
        }
        
        const result = await requestPhoneOtp(
          phoneNumber,
          user.name,
          {
            email: user.email,
            phoneNumber,
          },
          'update', // or 'otp' for verification
          'driver',
        );
        if (!result.ok) {
          console.log('❌ [DRIVER RESEND OTP] Failed to request OTP:', result);
          resp.error = true;
          resp.error_message = `Failed to send OTP. Please wait ${result.waitSeconds || 60}s`;
          return resp;
        }

        console.log('✅ [DRIVER RESEND OTP] Phone verification OTP resent successfully');
        resp.data = {
          phoneOtp: true,
          message: `Phone verification OTP has been resent to ${phoneNumber}`,
          phoneNumber: phoneNumber,
        };
        return resp;
      } else {
        // Phone is verified - this is for login/other purposes
        console.log('📱 [DRIVER RESEND OTP] User phone verified, resending OTP for login/verification');
        const result = await resendPhoneOtp(user.phoneNumber, user.name);
        if (!result.ok) {
          console.log('❌ [DRIVER RESEND OTP] Failed to resend OTP:', result);
          resp.error = true;
          resp.error_message = `Failed to send OTP. Please wait ${result.waitSeconds || 60}s`;
          return resp;
        }

        console.log('✅ [DRIVER RESEND OTP] OTP resent successfully');
        resp.data = {
          phoneOtp: true,
          message: `OTP has been sent to ${user.phoneNumber}`,
          phoneNumber: user.phoneNumber,
        };
        return resp;
      }
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
  } else if (!payload.roles.includes('driver')) {
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
    if (user.roles.includes('driver')) {
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

export const biometricLogin = async ({ signature, publicKey }, resp) => {
  try {
    console.log('Signature: ', signature);
    console.log('Public Key: ', publicKey);
    if (!signature || !publicKey) {
      resp.error = true;
      resp.error_message = 'Signature and public key are required';
      return resp;
    }

    const result = await verifyBiometricLogin(publicKey, signature);
    if (!result.success) {
      resp.error = true;
      resp.error_message = 'Failed to verify biometric';
      return resp;
    }

    const payload = { id: result.user?._id, roles: result.user?.roles };
    resp.data = {
      user: result.user,
      accessToken: generateAccessToken(payload),
      refreshToken: generateRefreshToken(payload),
    };
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'something went wrong';
    return resp;
  }
};
