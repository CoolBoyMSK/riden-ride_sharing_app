import {
  findAllAdmins,
  findAdminByEmail,
  createAdmin as dalCreateAdmin,
  findAdminById,
  updateAdminById,
} from '../../../dal/admin/index.js';
import {
  createAdminAccess,
  findAdminAccesses,
  upsertAdminAccess,
} from '../../../dal/admin/adminAccess/index.js';
import { hashPassword } from '../../../utils/auth.js';

export const getAllAdmins = async (currentAdmin, resp) => {
  const admins = await findAllAdmins();

  const ids = admins.map((a) => a._id);
  const accesses = await findAdminAccesses(ids);
  const accessMap = accesses.reduce((m, a) => {
    m[a.admin.toString()] = a.modules;
    return m;
  }, {});

  const result = admins.map((admin) => {
    if (admin.type !== 'super_admin') {
      admin.modules = accessMap[admin._id.toString()] || [];
    }
    return admin;
  });

  resp.data = result;
  return resp;
};

export const createAdmin = async (
  { name, email, password, profileImg, phoneNumber, modules },
  currentAdmin,
  resp,
) => {
  if (currentAdmin.type !== 'super_admin') {
    resp.auth = false;
    resp.error_message = 'Forbidden';
    return resp;
  }

  if (await findAdminByEmail(email)) {
    resp.error = true;
    resp.error_message = 'Email already in use';
    return resp;
  }

  const hashed = await hashPassword(password);
  const newAdmin = await dalCreateAdmin({
    name,
    email,
    password: hashed,
    profileImg,
    phoneNumber,
    type: 'admin',
  });

  await createAdminAccess({ adminId: newAdmin._id, modules });

  const adminObj = newAdmin.toObject();
  delete adminObj.password;
  adminObj.modules = modules;

  resp.data = adminObj;
  return resp;
};

export const updateAdmin = async (
  { id, name, email, password, profileImg, phoneNumber, modules },
  currentAdmin,
  resp,
) => {
  if (currentAdmin.type !== 'super_admin') {
    resp.auth = false;
    resp.error_message = 'Forbidden: only super_admin can update admins';
    return resp;
  }

  const admin = await findAdminById(id);
  if (!admin) {
    resp.error = true;
    resp.error_message = 'Admin not found';
    return resp;
  }

  const updateFields = {};
  if (name) updateFields.name = name;
  if (email) updateFields.email = email;
  if (profileImg) updateFields.profileImg = profileImg;
  if (phoneNumber) updateFields.phoneNumber = phoneNumber;
  if (password) updateFields.password = await hashPassword(password);

  const updatedAdmin = await updateAdminById(id, updateFields);

  if (modules) {
    await upsertAdminAccess(id, modules);
    updatedAdmin.modules = modules;
  }

  delete updatedAdmin.password;
  resp.data = updatedAdmin;
  return resp;
};
