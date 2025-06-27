import mongoose from 'mongoose';
import env from './envConfig.js';

const connectDB = async () => {
  try {
    const dbURI = env.DB_URI;

    if (!dbURI) {
      throw new Error('❌ DB_URI not found in environment variables');
    }

    await mongoose.connect(dbURI);

    console.log('✅ MongoDB connected');
  } catch (err) {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  }
};

export default connectDB;
