import AdminModel from '../../models/Admin.js';

export const findAdminByEmail = (email) => AdminModel.findOne({ email });
export const findAdminById = (id) => AdminModel.findById(id);
export const findAllAdmins = () => AdminModel.find({}, '-password').lean();
export const createAdmin = (adminData) => new AdminModel(adminData).save();