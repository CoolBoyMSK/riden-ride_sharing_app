import { extractToken, verifyAccessToken } from '../utils/auth.js';
import UserModel from '../models/User.js';

export const authenticate = async (req, res, next) => {
  const token = extractToken(req);
  if (!token)
    return res.status(401).json({ code: 401, message: 'Unauthorized' });

  const payload = verifyAccessToken(token);
  if (!payload?.id)
    return res.status(401).json({ code: 401, message: 'Unauthorized' });

  const user = await UserModel.findById(payload.id);
  if (!user || !user.roles.includes('passenger')) {
    return res.status(403).json({ code: 403, message: 'Forbidden' });
  }
  req.user = user;
  next();
};
