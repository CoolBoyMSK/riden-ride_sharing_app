import { extractToken, verifyAccessToken } from '../utils/auth.js';
import UserModel from '../models/User.js';

export const authenticate = async (req, res, next) => {
  const token = extractToken(req);
  console.log(token);
  if (!token)
    return res.status(401).json({ code: 401, message: 'Unauthorized1' });

  const payload = verifyAccessToken(token);
  console.log(payload);
  if (!payload?.id)
    return res.status(401).json({ code: 401, message: 'Unauthorized2' });

  const user = await UserModel.findById(payload.id);
  if (!user || !user.roles.includes('passenger')) {
    return res.status(403).json({ code: 403, message: 'Forbiddensss' });
  }
  console.log(user);
  req.user = user;
  next();
};
