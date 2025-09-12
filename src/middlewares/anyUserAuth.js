import jwt from 'jsonwebtoken';
import env from '../config/envConfig.js';

export const anyUserAuth = (req, res, next) => {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer (.+)$/);
  if (!match)
    return res.status(401).json({ code: 401, message: 'Missing token' });

  const payload = jwt.verify(match[1], env.JWT_ACCESS_SECRET, (err, p) => {
    if (err) return null;
    return p;
  });
  if (!payload)
    return res.status(401).json({ code: 401, message: 'Invalid token' });

  if (
    !payload.roles.includes('driver') &&
    !payload.roles.includes('passenger')
  ) {
    return res.status(403).json({ code: 403, message: 'Forbidden' });
  }
  req.user = payload;
  next();
};
