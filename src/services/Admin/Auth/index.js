import { findAdminByEmail } from '../../../dal/admin/index.js';
import {
  comparePasswords,
  generateAccessToken,
  generateRefreshToken,
} from '../../../utils/auth.js';

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
