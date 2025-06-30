import {
  findAllAdmins,
  findAdminByEmail,
  createAdmin as dalCreateAdmin,
} from '../../../dal/admin/index.js';
import { hashPassword } from '../../../utils/auth.js';

export const getAllAdmins = async (resp) => {
  const admins = await findAllAdmins();
  resp.data = admins;
  return resp;
};

export const createAdmin = async (
  { name, email, password, profileImg },
  currentAdmin,
  resp,
) => {
  if (currentAdmin.type !== 'super_admin') {
    resp.auth = false;
    resp.error_message = 'Forbidden';
    return resp;
  }

  const exists = await findAdminByEmail(email);
  if (exists) {
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

  const { password: _, ...safe } = newAdmin.toObject();
  resp.data = safe;
  return resp;
};
