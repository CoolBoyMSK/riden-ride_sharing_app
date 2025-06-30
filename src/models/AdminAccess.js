import mongoose from 'mongoose';
import { ADMIN_MODULES } from '../enums/adminModules.js';

const adminAccessSchema = new mongoose.Schema(
  {
    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      required: true,
      unique: true,
    },
    modules: [
      {
        type: String,
        enum: ADMIN_MODULES,
      },
    ],
  },
  { timestamps: true },
);

const AdminAccessModel = mongoose.model('AdminAccess', adminAccessSchema);

export default AdminAccessModel;
