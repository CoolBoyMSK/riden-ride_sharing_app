import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import AdminModel from '../models/Admin.js';
import { hashPassword } from '../utils/auth.js';

const seedSuperAdmin = async () => {
  try {
    await connectDB();

    const existingAdmin = await AdminModel.findOne({
      email: 'admin@riden.com',
    });

    if (existingAdmin) {
      console.log('⚠️ Super admin already exists');
    } else {
      const newAdmin = new AdminModel({
        name: 'Super Admin',
        email: 'admin@riden.com',
        password: await hashPassword('supersecure123'),
        type: 'super_admin',
      });

      await newAdmin.save();
      console.log('✅ Super admin seeded successfully');
    }

    mongoose.disconnect();
  } catch (err) {
    console.error('❌ Seeding failed:', err.message);
    mongoose.disconnect();
    process.exit(1);
  }
};

seedSuperAdmin();
