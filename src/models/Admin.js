import mongoose from 'mongoose';
import { ADMIN_ROLES } from '../enums/adminModules.js';

const adminSchema = new mongoose.Schema(
  {
    name: {
      type: String,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
    },
    phoneNumber: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
    },
    profileImg: {
      type: String,
    },
    type: {
      type: String,
      enum: ADMIN_ROLES,
      default: 'admin',
    },
  },
  { timestamps: true },
);

const AdminModel = mongoose.model('Admin', adminSchema);

export default AdminModel;
