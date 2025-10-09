import crypto from 'crypto';
import fetch from 'node-fetch';
import fs from 'fs/promises';
import UserModel from '../../models/User.js';
import DriverModel from '../../models/Driver.js';
import PassengerModel from '../../models/Passenger.js';
import UpdateRequest from '../../models/updateRequest.js';
import UserDevice from '../../models/UserDevice.js';
import env from '../../config/envConfig.js';
import CMS from '../../models/CMS.js';
import { sendEmailUpdateVerificationOtp } from '../../templates/emails/user/index.js';
import mongoose from 'mongoose';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';

export const findUserByEmail = async (email) =>
  UserModel.findOne({ email }).lean();

export const findUserByPhone = async (phoneNumber) =>
  UserModel.findOne({ phoneNumber }).lean();

export const createUser = async (payload) => new UserModel(payload).save();

export const updateUserById = (filter, update) =>
  UserModel.findByIdAndUpdate(filter, update, { new: true });

export const findUserById = async (id) => {
  const user = await UserModel.findById(id).lean();
  if (!user) return false;

  if (user.roles.includes('driver')) {
    const driver = await DriverModel.findOne({ userId: user._id })
      .populate('userId')
      .lean();
    return driver;
  }

  if (user.roles.includes('passenger')) {
    const passenger = await PassengerModel.findOne({ userId: user._id })
      .populate('userId')
      .lean();
    return passenger;
  }
};

export const createProfileUpdateRequest = async (payload) => {
  try {
    const request = new UpdateRequest(payload);
    return await request.save();
  } catch (err) {
    console.error('Failed to create admin request:', err);
    return null;
  }
};

export const sendEmailUpdateOtp = async (email, otp, username) => {
  const mailSent = await sendEmailUpdateVerificationOtp(email, otp, username);
};

async function getHashFromUrl(url, timeout = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`Failed to fetch: ${url} (${res.status})`);

    const hash = crypto.createHash('sha256');
    for await (const chunk of res.body) {
      hash.update(chunk);
    }
    return hash.digest('hex');
  } finally {
    clearTimeout(timer);
  }
}

async function getHashFromFile(filePath) {
  const buffer = await fs.readFile(filePath);
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function getHashFromBuffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export async function isSameImage(imgA, imgB) {
  try {
    const getHash = async (source) => {
      if (typeof source === 'string') {
        // If it's a URL (starts with http/https), fetch and hash
        if (source.startsWith('http://') || source.startsWith('https://')) {
          return getHashFromUrl(source);
        }
        // Otherwise, treat as a local file path
        return getHashFromFile(source);
      }

      // If it's a Buffer (e.g., req.file.buffer from Multer)
      if (Buffer.isBuffer(source)) {
        return getHashFromBuffer(source);
      }

      throw new Error('Unsupported source type');
    };

    const [hashA, hashB] = await Promise.all([getHash(imgA), getHash(imgB)]);
    return hashA === hashB;
  } catch (err) {
    console.error(`Comparison failed: ${err.message}`);
    return false; // Treat as "different" on error
  }
}

export const findRecovertNumbersbyUserId = async (id) =>
  UserModel.findOne({ _id: id }).select('recoveryPhoneNumbers').lean();

export const addRecoveryNumber = async (userId, number) => {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error('Invalid user ID');
  }

  const normalizedNumber = number.trim();

  const existingUser = await UserModel.findOne({
    _id: userId,
    'recoveryPhoneNumbers.number': normalizedNumber,
  }).select('_id');

  if (existingUser) {
    throw new Error('This recovery phone number already exists.');
  }

  const updatedUser = await UserModel.findByIdAndUpdate(
    userId,
    { $addToSet: { recoveryPhoneNumbers: { number: normalizedNumber } } },
    { new: true, projection: { recoveryPhoneNumbers: 1 } },
  ).lean();

  if (!updatedUser) {
    throw new Error('User not found or failed to add recovery number.');
  }

  return updatedUser;
};

export const deleteRecoveryNumber = async (userId, recoveryId) => {
  if (
    !mongoose.Types.ObjectId.isValid(userId) ||
    !mongoose.Types.ObjectId.isValid(recoveryId)
  ) {
    throw new Error('Invalid user or recovery ID');
  }

  const updatedUser = await UserModel.findByIdAndUpdate(
    userId,
    { $pull: { recoveryPhoneNumbers: { _id: recoveryId } } }, // Match by _id
    { new: true, projection: { recoveryPhoneNumbers: 1 } },
  ).lean();

  if (!updatedUser) {
    throw new Error('Recovery number not found for this user');
  }

  return updatedUser;
};

export const updateRecoveryPhoneNumber = async (
  userId,
  recoveryId,
  newNumber,
) => {
  if (
    !mongoose.Types.ObjectId.isValid(userId) ||
    !mongoose.Types.ObjectId.isValid(recoveryId)
  ) {
    throw new Error('Invalid user or recovery ID');
  }

  const updatedUser = await UserModel.findOneAndUpdate(
    { _id: userId, 'recoveryPhoneNumbers._id': recoveryId },
    { $set: { 'recoveryPhoneNumbers.$.number': newNumber.trim() } },
    { new: true, projection: { recoveryPhoneNumbers: 1 } },
  ).lean();

  if (!updatedUser) {
    throw new Error('Recovery number not found for this user');
  }

  return updatedUser;
};

// === REGISTER PASSKEY START (one-time setup after normal login) ===

// --- Registration Step 1 ---
export const getPasskeyRegisterOptions = async (userId) => {
  const user = await UserModel.findById(userId);
  if (!user) throw new Error('User not found');

  const userIDBuffer = Buffer.from(user._id.toString(), 'utf8');

  const options = generateRegistrationOptions({
    rpName: env.RP_NAME,
    rpID: env.RP_ID,
    userID: userIDBuffer,
    userName: user.email || user.phoneNumber || `user-${user._id}`,
    attestationType: 'none',
  });

  user.passkeyChallenge = options.challenge;
  await user.save();

  return options;
};

// --- Registration Step 2 ---
export const verifyPasskeyRegistration = async (userId, credential) => {
  const user = await UserModel.findById(userId);
  if (!user || !user.passkeyChallenge) throw new Error('Challenge missing');

  const verification = await verifyRegistrationResponse({
    response: credential,
    expectedChallenge: user.passkeyChallenge,
    expectedOrigin: env.ORIGIN,
    expectedRPID: env.RP_ID,
  });

  if (!verification.verified) throw new Error('Passkey registration failed');

  const { credentialPublicKey, credentialID, counter, transports } =
    verification.registrationInfo;

  user.passkeys.push({
    credentialID: Buffer.from(credentialID).toString('base64url'),
    publicKey: Buffer.from(credentialPublicKey).toString('base64url'),
    counter,
    transports,
  });

  user.passkeyChallenge = undefined;
  await user.save();

  return { verified: true };
};

// === REGISTER PASSKEY END (one-time setup after normal login) ===

export const update2FAStatus = async (userId) => {
  const user = await UserModel.findById(userId);
  if (!user) throw new Error('User not found');

  user.is2FAEnabled = !user.is2FAEnabled; // toggle boolean
  await user.save();

  return { is2FAEnabled: user.is2FAEnabled };
};

export const findCMSPages = async () => CMS.find().select('page').lean();

export const findCMSPageById = async (id) => CMS.findById(id).lean();

export const createDeviceInfo = async (payload) => UserDevice.create(payload);

export const findDeviceInfo = async (userId) => {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  return UserDevice.find({
    userId,
    lastLoginAt: { $gte: thirtyDaysAgo }, // only last 30 days
  }).sort({ lastLoginAt: -1 }); // latest first
};
