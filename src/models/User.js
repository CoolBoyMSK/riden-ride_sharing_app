import mongoose from 'mongoose';
import { USER_TYPES } from '../enums/userRoles.js';
import { GENDER_TYPES } from '../enums/genderEnums.js';

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      lowercase: true,
      unique: true,
      sparse: true,
    },
    phoneNumber: {
      type: String,
      unique: true,
      sparse: true,
    },
    password: {
      type: String,
    },
    profileImg: {
      type: String,
    },
    referralCode: {
      type: String,
      unique: true,
      sparse: true,
    },
    roles: {
      type: [String],
      enum: USER_TYPES,
      default: ['passenger'],
    },
    gender: {
      type: String,
      enum: GENDER_TYPES,
      required: false,
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    isPhoneVerified: {
      type: Boolean,
      default: false,
    },
    canResetPassword: {
      type: Boolean,
      default: false,
    },
    isCompleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

export default mongoose.model('User', userSchema);
