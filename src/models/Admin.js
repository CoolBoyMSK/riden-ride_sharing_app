import mongoose from 'mongoose';

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
    password: {
      type: String,
      required: true,
    },
    profileImg: {
      type: String,
    },
    type: {
      type: String,
      enum: ['super_admin', 'admin'],
      default: 'admin',
    },
  },
  { timestamps: true },
);

const AdminModel = mongoose.model('Admin', adminSchema);

export default AdminModel;
