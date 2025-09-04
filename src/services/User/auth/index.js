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
import { verifyOtp, requestOtp } from '../../../utils/otpUtils.js';

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

// export const loginUser = async ({ email, password }, resp) => {
//   const user = await findUserByEmail(email);
//   if (!user) {
//     resp.error = true;
//     resp.error_message = 'Invalid credentials';
//     return resp;
//   }

//   const match = await comparePasswords(password, user.password);
//   if (!match) {
//     resp.error = true;
//     resp.error_message = 'Invalid credentials';
//     return resp;
//   }

//   const userId = user._id.toString();

//   if (user.roles.includes('passenger')) {
//     const passenger = await findPassengerByUserId(userId);
//     if (!passenger) {
//       await createPassengerProfile(userId);
//     }
//   }

//   if (user.roles.includes('driver')) {
//     const driver = await findDriverByUserId(userId);
//     if (!driver) {
//       await createDriverProfile(userId);
//     }
//   }

//   const payload = { id: userId, roles: user.roles };
//   resp.data = {
//     accessToken: generateAccessToken(payload),
//     refreshToken: generateRefreshToken(payload),
//   };

//   return resp;
// };

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
      } else if (phoneNumber) {
        user = await findUserByPhone(phoneNumber);
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

      // ✅ Check if phone is verified
      if (!user.isPhoneVerified) {
        // send OTP to phone
        await requestOtp(phoneNumber, {
          type: 'verify-passenger',
          role: 'passenger',
          userId: user?._id,
        });

        resp.data = { otpSent: true, flow: 'verify-phone' };
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
      if (!phoneNumber) {
        resp.error = true;
        resp.error_message = 'Phone number required for driver login';
        return resp;
      }

      let user = await findUserByPhone(phoneNumber);

      if (user && user.isPhoneVerified) {
        // ✅ Existing verified driver → Send OTP for login
        await requestOtp(phoneNumber, {
          type: 'login',
          role: 'driver',
          userId: user?._id,
        });

        resp.data = { otpSent: true, flow: 'login' };
        return resp;
      } else {
        // 🚀 New driver OR unverified driver → Send OTP for registration
        if (!user) {
          // Create a pending driver record
          user = await createUser({
            phoneNumber,
            roles: ['driver'],
            status: 'pending',
            isPhoneVerified: false,
          });
        }

        await requestOtp(phoneNumber, {
          type: 'register',
          role: 'driver',
          userId: user?._id,
        });
        resp.data = { otpSent: true, flow: 'register' };
        return resp;
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
        await updateUserById(userId, {
          isPhoneVerified: true,
          status: 'active',
        });

        let driverProfile = await findDriverByUserId(userId);
        if (!driverProfile) {
          driverProfile = await createDriverProfile(userId);
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
        await updateUserById(userId, { isPhoneVerified: true });
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

export const forgotPassword = async ({phoneNumber}, resp) => {
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

    // Send OTP for password reset
    await requestOtp(phoneNumber, {
      type: 'reset-password',
      role: 'passenger',
      userId: user?._id,
    });

    resp.data = { otpSent: true };
    return resp;
  } catch (err) {
    console.error('Forgot Password Error:', err);
    resp.error = true;
    resp.error_message = 'Something went wrong while requesting password reset';
    return resp;
  }
};

export const resetUserPassword = async ({newPassword, phoneNumber}, resp) => {
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
