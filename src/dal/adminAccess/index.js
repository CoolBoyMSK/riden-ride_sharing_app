import AdminAccessModel from '../../models/AdminAccess.js';

export const createAdminAccess = ({ adminId, modules }) =>
  new AdminAccessModel({ admin: adminId, modules }).save();
export const findAdminAccesses = (adminIds) =>
  AdminAccessModel.find({ admin: { $in: adminIds } }).lean();
export const upsertAdminAccess = (adminId, modules) =>
  AdminAccessModel.findOneAndUpdate(
    { admin: adminId },
    { modules },
    { new: true, upsert: true },
  ).lean();
