import { nanoid } from 'nanoid';
import {
  deleteResetOtpById,
  findResetOtp,
  upsertResetOtp,
} from '../../../dal/admin/adminOTP/index.js';
import { findAdminByEmail, findAdminById } from '../../../dal/admin/index.js';
import { sendAdminPasswordResetEmail } from '../../../templates/emails/admin/index.js';
import {
  censorString,
  comparePasswords,
  generateAccessToken,
  generateRefreshToken,
  hashPassword,
  verifyRefreshToken,
} from '../../../utils/auth.js';
import { emailQueue } from '../../../queues/emailQueue.js';

export const loginService = async ({ email, password }, resp) => {
  const admin = await findAdminByEmail(email);
  if (!admin) {
    resp.error = true;
    resp.error_message = 'Invalid credentials';
    return resp;
  }

  const passwordMatch = await comparePasswords(password, admin.password);
  if (!passwordMatch) {
    resp.error = true;
    resp.error_message = 'Invalid credentials';
    return resp;
  }

  const payload = { id: admin._id, type: admin.type };
  resp.data = {
    accessToken: generateAccessToken(payload),
    refreshToken: generateRefreshToken(payload),
  };

  return resp;
};

export const refreshTokens = async ({ refreshToken }, resp) => {
  const payload = verifyRefreshToken(refreshToken);
  if (!payload?.id) {
    resp.error = true;
    resp.error_message = 'Invalid or expired refresh token';
    return resp;
  }

  const newAccessToken = generateAccessToken({
    id: payload.id,
    type: payload.type,
  });

  resp.data = {
    accessToken: newAccessToken,
  };
  return resp;
};

export const getAdminProfile = async (currentAdmin, resp) => {
  const adminObj = currentAdmin.toObject();
  adminObj.password = censorString(adminObj.password);

  if (adminObj.type !== 'super_admin') {
    adminObj.modules = currentAdmin.modules || [];
  }

  resp.data = adminObj;
  return resp;
};

export const initiateAdminPasswordReset = async (email, resp) => {
  const admin = await findAdminByEmail(email);
  if (!admin) {
    resp.error = true;
    resp.error_message = 'No admin found with that email';
    return resp;
  }

  const token = nanoid(32);
  await upsertResetOtp(admin._id.toString(), token);

  await emailQueue.add('adminPasswordReset', { email, token });

  return resp;
};

export const completeAdminPasswordReset = async (token, newPassword, resp) => {
  const record = await findResetOtp(token);
  if (!record) {
    resp.error = true;
    resp.error_message = 'Invalid or expired reset token';
    return resp;
  }

  const admin = await findAdminById(record.target);
  if (!admin) {
    resp.error = true;
    resp.error_message = 'Admin not found';
    return resp;
  }

  admin.password = await hashPassword(newPassword);
  await admin.save();

  await deleteResetOtpById(record._id);

  return resp;
};
