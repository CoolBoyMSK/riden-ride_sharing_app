import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import env from '../config/envConfig.js';
import crypto from 'crypto';
import mongoose from 'mongoose';
import User from '../models/User.js';

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

const getPasskeyLoginOptions = async (emailOrPhone) => {
  const user = await User.findOne({
    $or: [{ email: emailOrPhone }, { phoneNumber: emailOrPhone }],
  });

  if (!user || !user.passkeys || !user.passkeys.length) {
    throw new Error('No passkeys registered');
  }

  // Convert stored credentialID (base64url or Buffer) to a BufferSource
  const allowCredentials = user.passkeys.map((pk) => {
    // If you stored credentialID as base64url, decode it:
    const credentialIDBuffer =
      typeof pk.credentialID === 'string'
        ? Buffer.from(pk.credentialID, 'base64url')
        : pk.credentialID;

    return {
      id: credentialIDBuffer,
      type: 'public-key',
    };
  });

  const options = generateAuthenticationOptions({
    allowCredentials,
    userVerification: 'preferred', // optional: 'preferred' | 'required' | 'discouraged'
  });

  user.passkeyChallenge = options.challenge;
  await user.save();

  return options;
};

const verifyPasskeyLogin = async (emailOrPhone, response) => {
  const user = await User.findOne({
    $or: [{ email: emailOrPhone }, { phoneNumber: emailOrPhone }],
  });
  if (!user || !user.passkeys) throw new Error('User or passkeys not found');

  // Decode credential ID from response
  const credentialIDBuffer = Buffer.from(response.id, 'base64url');

  // Find the stored authenticator that matches the credential
  const authenticator = user.passkeys.find((pk) => {
    const storedID =
      typeof pk.credentialID === 'string'
        ? Buffer.from(pk.credentialID, 'base64url')
        : Buffer.from(pk.credentialID);
    return storedID.equals(credentialIDBuffer);
  });

  if (!authenticator)
    throw new Error('Authenticator not found for this credential');

  // Verify the authentication response
  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge: user.passkeyChallenge,
    expectedOrigin: 'https://api.riden.online', // your frontend origin
    expectedRPID: 'https://api.riden.online', // your RP ID (usually your domain)
    authenticator: {
      credentialID:
        authenticator.credentialID instanceof Buffer
          ? authenticator.credentialID
          : Buffer.from(authenticator.credentialID, 'base64url'),
      credentialPublicKey: Buffer.from(authenticator.credentialPublicKey), // stored during registration
      counter: authenticator.counter,
      transports: authenticator.transports, // optional
    },
  });

  if (!verification.verified) throw new Error('Invalid passkey login');

  // ✅ Update signature counter
  authenticator.counter = verification.authenticationInfo.newCounter;
  await user.save();

  // Generate tokens
  const payload = { id: user._id, roles: user.roles };
  return {
    user,
    accessToken: generateAccessToken(payload),
    refreshToken: generateRefreshToken(payload),
  };
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
};
