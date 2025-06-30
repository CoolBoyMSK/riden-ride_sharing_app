import AdminAccessModel from '../../models/AdminAccess.js';

export const createAdminAccess = ({ adminId, modules }) =>
  new AdminAccessModel({ admin: adminId, modules }).save();
