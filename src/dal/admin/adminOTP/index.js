import AdminOtpModel from '../../../models/admin_otp.js';

export const upsertResetOtp = (adminId, otp) =>
  AdminOtpModel.findOneAndUpdate(
    { target: adminId, type: 'reset_password' },
    { otp, expiresAt: new Date(Date.now() + 30 * 60 * 1000) },
    { new: true, upsert: true },
  ).lean();

export const findResetOtp = (otp) =>
  AdminOtpModel.findOne({ otp, type: 'reset_password' }).lean();

export const deleteResetOtpById = (id) => AdminOtpModel.deleteOne({ _id: id });
