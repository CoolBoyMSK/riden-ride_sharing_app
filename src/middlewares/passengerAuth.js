import { extractToken, verifyAccessToken } from '../utils/auth.js';
import UserModel from '../models/User.js';
import PassengerModel from '../models/Passenger.js';

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

  // Check if passenger is blocked or inactive
  const passenger = await PassengerModel.findOne({ userId: user._id }).lean();
  if (passenger && (passenger.isBlocked || passenger.isActive === false)) {
    return res.status(403).json({ 
      code: 403, 
      message: 'Account is blocked or inactive. Please contact support.' 
    });
  }

  req.user = user;
  next();
};
