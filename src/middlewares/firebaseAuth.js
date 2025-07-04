import firebaseAdmin from '../config/firebaseAdmin.js';

export const verifyFirebaseToken = async (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) {
    return res
      .status(401)
      .json({ code: 401, message: 'Missing Firebase auth token' });
  }

  try {
    const decoded = await firebaseAdmin.auth().verifyIdToken(match[1]);
    req.firebasePhone = decoded.phone_number;
    return next();
  } catch (err) {
    return res
      .status(401)
      .json({ code: 401, message: 'Invalid Firebase token' });
  }
};
