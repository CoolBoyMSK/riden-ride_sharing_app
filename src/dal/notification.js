import User from '../models/User.js';

export const findNotificationSettings = (id) =>
  User.findById(id).select('notifications').lean();

export const updateNotificaition = (id, payload) =>
  User.findByIdAndUpdate(id, payload, { new: true }).select("notifications").lean();
