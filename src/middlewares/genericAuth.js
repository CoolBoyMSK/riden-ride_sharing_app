import { verifyAccessToken } from '../utils/auth.js';

export const authenticateUser = (req, res, next) => {
  const auth = req.headers.authorization || '';
  const [scheme, token] = auth.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res
      .status(401)
      .json({ code: 401, message: 'Missing or invalid auth header' });
  }
  const payload = verifyAccessToken(token);
  if (!payload) {
    return res
      .status(401)
      .json({ code: 401, message: 'Invalid or expired token' });
  }
  req.user = payload;
  next();
};
