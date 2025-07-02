import AdminModel from '../../models/Admin.js';

export const findAdminByEmail = (email) => AdminModel.findOne({ email });
export const findAdminById = (id) => AdminModel.findById(id);
export const findAllAdmins = () => AdminModel.find({}, '-password -__v').lean();
export const createAdmin = (adminData) => new AdminModel(adminData).save();
export const updateAdminById = (id, update) =>
  AdminModel.findByIdAndUpdate(id, update, { new: true }).lean();
