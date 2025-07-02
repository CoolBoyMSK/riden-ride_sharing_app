import { extractToken, verifyAccessToken } from '../utils/auth.js';
import AdminModel from '../models/Admin.js';
import AdminAccessModel from '../models/AdminAccess.js';

export const adminAuthenticate = async (req, res, next) => {
  const token = extractToken(req);
  if (!token)
    return res.status(401).json({ code: 401, message: 'Unauthorized' });

  const payload = verifyAccessToken(token);
  if (!payload?.id)
    return res.status(401).json({ code: 401, message: 'Unauthorized' });

  const admin = await AdminModel.findById(payload.id);
  if (!admin)
    return res.status(401).json({ code: 401, message: 'Unauthorized' });

  const access = await AdminAccessModel.findOne({ admin: admin._id });
  req.user = admin;
  req.user.modules = access?.modules || [];
  next();
};

export const permitModule = (moduleName) => (req, res, next) => {
  if (req.user?.type === 'super_admin') {
    return next();
  }

  if (!req.user?.modules?.includes(moduleName)) {
    return res.status(403).json({
      code: 403,
      message: `Access denied: missing permission for ${moduleName}`,
    });
  }

  next();
};

export const onlySuperAdmin = (req, res, next) => {
  if (req.user?.type !== 'super_admin') {
    return res.status(403).json({
      code: 403,
      message: 'Forbidden: only super_admin can perform this action',
    });
  }
  next();
};
