import crypto from 'crypto';
import fetch from 'node-fetch';
import fs from 'fs/promises';
import UserModel from '../../models/User.js';
import DriverModel from '../../models/Driver.js';
import PassengerModel from '../../models/Passenger.js';
import UpdateRequest from '../../models/updateRequest.js';
import CMS from '../../models/CMS.js';
import { sendEmailUpdateVerificationOtp } from '../../templates/emails/user/index.js';
import mongoose from 'mongoose';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';

export const findUserByEmail = (email) => UserModel.findOne({ email }).lean();

export const findUserByPhone = (phoneNumber) =>
  UserModel.findOne({ phoneNumber }).lean();

export const createUser = (payload) => new UserModel(payload).save();

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

// === REGISTER PASSKEY (one-time setup after normal login) ===
export const getPasskeyRegisterOptions = async (userId) => {
  const user = await UserModel.findById(userId);
  if (!user) throw new Error('User not found');

  // ✅ Convert Mongo ObjectId string to a Uint8Array
  const encoder = new TextEncoder();
  const userIDBuffer = encoder.encode(user._id.toString());

  const options = generateRegistrationOptions({
    rpName: 'riden', // Your app name
    userID: userIDBuffer, // <-- must be a BufferSource now
    userName: user.email || user.phoneNumber || `user-${user._id}`,
    attestationType: 'none',
  });

  // Save the challenge for later verification
  user.passkeyChallenge = options.challenge;
  await user.save();

  return options;
};

export const verifyPasskeyRegistration = async (userId, credential) => {
  const user = await UserModel.findById(userId);
  if (!user || !user.passkeyChallenge) throw new Error('Challenge missing');

  const verification = await verifyRegistrationResponse({
    response: credential,
    expectedChallenge: user.passkeyChallenge,
    expectedOrigin: 'https://your-frontend-domain.com',
    expectedRPID: 'your-domain.com',
  });

  if (!verification.verified) {
    throw new Error('Passkey registration failed');
  }

  // Save the credential info for later login
  const { credentialPublicKey, credentialID, counter } =
    verification.registrationInfo;

  user.passkeys = user.passkeys || [];
  user.passkeys.push({
    credentialID: Buffer.from(credentialID).toString('base64'),
    publicKey: Buffer.from(credentialPublicKey).toString('base64'),
    counter,
  });

  user.passkeyChallenge = undefined;
  await user.save();

  return { verified: true };
};

export const update2FAStatus = async (userId) => {
  const user = await UserModel.findById(userId);
  if (!user) throw new Error('User not found');

  user.is2FAEnabled = !user.is2FAEnabled; // toggle boolean
  await user.save();

  return { is2FAEnabled: user.is2FAEnabled };
};

export const findCMSPages = async () => CMS.find().select('page').lean();

export const findCMSPageById = async (id) => CMS.findById(id).lean();
