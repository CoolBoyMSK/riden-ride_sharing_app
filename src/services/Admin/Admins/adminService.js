import {
  findAllAdmins,
  findAdminByEmail,
  createAdmin as dalCreateAdmin,
} from '../../../dal/admin/index.js';
import { createAdminAccess } from '../../../dal/adminAccess/index.js';
import { hashPassword } from '../../../utils/auth.js';

export const getAllAdmins = async (resp) => {
  const admins = await findAllAdmins();
  resp.data = admins;
  return resp;
};

export const createAdmin = async (
  { name, email, password, profileImg, modules },
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
    type: 'admin',
  });

  await createAdminAccess({ adminId: newAdmin._id, modules });

  const adminObj = newAdmin.toObject();
  delete adminObj.password;
  adminObj.modules = modules;

  resp.data = adminObj;
  return resp;
};
