import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import env from '../config/envConfig.js';
import crypto from 'crypto';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Biometric from '../models/Biometric.js';
import base64url from 'base64url';
import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';

const SALT_ROUNDS = env.SALT_ROUNDS;
const JWT_ACCESS_SECRET = env.JWT_ACCESS_SECRET;
const JWT_REFRESH_SECRET = env.JWT_REFRESH_SECRET;
const JWT_ACCESS_EXPIRES_IN = env.JWT_ACCESS_EXPIRES_IN;
const JWT_REFRESH_EXPIRES_IN = env.JWT_REFRESH_EXPIRES_IN;

const hashPassword = async (plainPassword) => {
  return await bcrypt.hash(plainPassword, SALT_ROUNDS);
};

const comparePasswords = async (plainPassword, hashedPassword) => {
  return await bcrypt.compare(plainPassword, hashedPassword);
};

const generateOtp = () => {
  return crypto.randomInt(10000, 99999).toString();
};

const generateAccessToken = (payload) => {
  return jwt.sign(payload, JWT_ACCESS_SECRET, {
    expiresIn: JWT_ACCESS_EXPIRES_IN,
  });
};

const verifyAccessToken = (token) => {
  try {
    return jwt.verify(token, JWT_ACCESS_SECRET);
  } catch (err) {
    return null;
  }
};

const generateRefreshToken = (payload) => {
  return jwt.sign(payload, JWT_REFRESH_SECRET, {
    expiresIn: JWT_REFRESH_EXPIRES_IN,
  });
};

const verifyRefreshToken = (token) => {
  try {
    return jwt.verify(token, JWT_REFRESH_SECRET);
  } catch (err) {
    return null;
  }
};

const extractToken = (req) => {
  const h = req.headers.authorization;
  return h && h.startsWith('Bearer ') ? h.slice(7) : null;
};

const censorString = (value, visibleCount = 3) => {
  if (typeof value !== 'string') return '';
  const len = value.length;
  if (len <= visibleCount) return value;
  const stars = '*'.repeat(len - visibleCount);
  return stars + value.slice(-visibleCount);
};

const generateUniqueId = (role, userObjectId) => {
  if (!mongoose.Types.ObjectId.isValid(userObjectId)) {
    throw new Error('Invalid ObjectId');
  }
  let prefix;
  if (role === 'passenger') {
    prefix = 'P-';
  } else if (role === 'driver') {
    prefix = 'D-';
  } else if (role === 'ride') {
    prefix = 'R-';
  } else if (role === 'complain') {
    prefix = 'C-';
  } else if (role === 'report') {
    prefix = 'I-';
  } else {
    throw new Error('Invalid Role');
  }
  const objectIdStr = userObjectId.toString();
  const last6 = objectIdStr.slice(-6).toUpperCase();

  return prefix + last6;
};

// --- Login Step 1 ---
const getPasskeyLoginOptions = async (emailOrPhone) => {
  const user = await User.findOne({
    $or: [{ email: emailOrPhone }, { phoneNumber: emailOrPhone }],
  });

  if (!user || !user.passkeys?.length) {
    throw new Error('No passkeys registered');
  }

  const allowCredentials = user.passkeys.map((pk) => ({
    id: Buffer.from(pk.credentialID, 'base64url'),
    type: 'public-key',
  }));

  const options = generateAuthenticationOptions({
    rpID: env.RP_ID,
    allowCredentials,
    userVerification: 'preferred',
  });

  user.passkeyChallenge = options.challenge;
  await user.save();

  return options;
};

// --- Login Step 2 ---
const verifyPasskeyLogin = async (emailOrPhone, response) => {
  const user = await User.findOne({
    $or: [{ email: emailOrPhone }, { phoneNumber: emailOrPhone }],
  });
  if (!user || !user.passkeys) throw new Error('User or passkeys not found');

  const credentialIDBuffer = Buffer.from(response.id, 'base64url');

  const authenticator = user.passkeys.find((pk) =>
    Buffer.from(pk.credentialID, 'base64url').equals(credentialIDBuffer),
  );

  if (!authenticator)
    throw new Error('Authenticator not found for this credential');

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge: user.passkeyChallenge,
    expectedOrigin: env.ORIGIN,
    expectedRPID: env.RP_ID,
    authenticator: {
      credentialID: Buffer.from(authenticator.credentialID, 'base64url'),
      credentialPublicKey: Buffer.from(authenticator.publicKey, 'base64url'),
      counter: authenticator.counter,
      transports: authenticator.transports,
    },
  });

  if (!verification.verified) throw new Error('Invalid passkey login');

  authenticator.counter = verification.authenticationInfo.newCounter;
  await user.save();

  const payload = { id: user._id, roles: user.roles };
  return {
    user,
    accessToken: generateAccessToken(payload),
    refreshToken: generateRefreshToken(payload),
  };
};

const verifyBiometricLogin = async (publicKey, signature) => {
  // Get user's stored public key
  const biometric = await Biometric.findOne({ publicKey });

  if (!biometric || !biometric.biometricEnabled) {
    throw new Error('Biometric not registered or disabled');
  }

  const user = await User.findById(biometric.userId);
  if (!user) {
    throw new Error('User not found');
  }

  // Verify signature with stored public key
  const isValidSignature = await verifySignature(signature, publicKey);
  if (!isValidSignature) {
    throw new Error('Biometric verification failed');
  }

  // Update last used timestamp
  await Biometric.findOneAndUpdate(
    { userId: user._id },
    { lastBiometricUsed: new Date() },
    { new: true },
  );

  return {
    success: true,
    user,
  };
};

const verifySignature = async (signature, publicKey) => {
  const verify = crypto.createVerify('SHA256');
  verify.update('login-challenge');
  verify.end();
  return verify.verify(publicKey, signature, 'base64');
};

export {
  hashPassword,
  comparePasswords,
  generateOtp,
  generateAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  extractToken,
  censorString,
  generateUniqueId,
  getPasskeyLoginOptions,
  verifyPasskeyLogin,
  verifyBiometricLogin,
};
