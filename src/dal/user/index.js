import UserModel from '../../models/User.js';

export const findUserByEmail = (email) => UserModel.findOne({ email }).lean();

export const findUserByPhone = (phoneNumber) =>
  UserModel.findOne({ phoneNumber }).lean();

export const createUser = (payload) => new UserModel(payload).save();

export const updateUserById = (filter, update) =>
  UserModel.findByIdAndUpdate(filter, update, { new: true });

export const findUserById = (id) => UserModel.findById(id).lean();
