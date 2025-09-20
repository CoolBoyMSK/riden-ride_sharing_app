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
  createWallet,
} from '../../../dal/stripe.js';
// import { otpQueue } from '../../../queues/otpQueue.js';
import { verifyOtp, sendOtp } from '../../../utils/otpUtils.js';

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

  if (await findUserByEmail(email)) {
    resp.error = true;
    resp.error_message = 'Email already in use';
    return resp;
  }

  if (users && users.roles.includes('driver')) {
    user = await updateUserById(
      { _id: user._id },
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

    const stripeAccountId = await createDriverStripeAccount(driverProfile);
    if (!stripeAccountId) {
      resp.error = true;
      resp.error_message = 'Failed to create stripe Account Id';
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

    const stripeCustomerId =
      await createPassengerStripeCustomer(passengerProfile);
    if (!stripeCustomerId) {
      resp.error = true;
      resp.error_message = 'Failed to create stripe customer account';
      return resp;
    }

    const wallet = await createWallet(passengerProfile._id);
    if (!wallet) {
      resp.error = true;
      resp.error_message = 'Failed to create In-App wallet';
      return resp;
    }

    const userObj = user.toObject();
    delete userObj.password;
    resp.data = userObj;
    return resp;
  } else {
    resp.error = true;
    resp.error_message = 'Invalid User role';
    return resp;
  }
};

export const loginUser = async (
  { email, phoneNumber, password, role },
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
          // For Production
          // const sent = await sendOtp(phoneNumber);
          // resp.data = { otpSent: true, flow: 'login' };
          // For Production
          const success = await updateDriverByUserId(user._id, {
            isActive: true,
          });
          if (!success) {
            resp.error = true;
            resp.error_message = 'Failed to activate passenger';
            return resp;
          }
          // For Testing
          const payload = { id: user._id, roles: user.roles };
          resp.data = {
            user: user,
            accessToken: generateAccessToken(payload),
            refreshToken: generateRefreshToken(payload),
            flow: 'login',
          };
          // For Testing

          return resp;
        } else {
          if (!user) {
            user = await createUser({
              phoneNumber,
              roles: ['driver'],
              status: 'pending',
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
          });
          if (!success) {
            resp.error = true;
            resp.error_message = 'Failed to activate passenger';
            return resp;
          }
          // For Testing
          const payload = { id: user._id, roles: user.roles };
          resp.data = {
            user: user,
            accessToken: generateAccessToken(payload),
            refreshToken: generateRefreshToken(payload),
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

          // For Testing
          const payload = { id: user._id, roles: user.roles };
          resp.data = {
            user: user,
            accessToken: generateAccessToken(payload),
            refreshToken: generateRefreshToken(payload),
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
    console.error('Login Error:', err);
    resp.error = true;
    resp.error_message = 'Something went wrong during login';
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
    console.error('OTP Verification Error:', err);
    resp.error = true;
    resp.error_message = 'Something went wrong during OTP verification';
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
    console.error('Forgot Password Error:', err);
    resp.error = true;
    resp.error_message = 'Something went wrong while requesting password reset';
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
    console.error('Reset Password Error:', err);
    resp.error = true;
    resp.error_message = 'Something went wrong while resetting password';
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
