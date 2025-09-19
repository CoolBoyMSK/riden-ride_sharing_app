import crypto from 'crypto';
import fetch from 'node-fetch';
import fs from 'fs/promises';
import UserModel from '../../models/User.js';
import UpdateRequest from '../../models/updateRequest.js';
import { sendEmailUpdateVerificationOtp } from '../../templates/emails/user/index.js';

export const findUserByEmail = (email) => UserModel.findOne({ email }).lean();

export const findUserByPhone = (phoneNumber) =>
  UserModel.findOne({ phoneNumber }).lean();

export const createUser = (payload) => new UserModel(payload).save();

export const updateUserById = (filter, update) =>
  UserModel.findByIdAndUpdate(filter, update, { new: true });

export const findUserById = (id) => UserModel.findById(id).lean();

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
