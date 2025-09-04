import mongoose from 'mongoose';
import { USER_TYPES } from '../enums/userRoles.js';
import { GENDER_TYPES } from '../enums/genderEnums.js';
import { AUTH_PROVIDERS } from '../enums/authProviders.js';

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
    addresses: [
      {
        title: {
          type: String,
          trim: true,
        },
        location: {
          type: {
            type: String,
            enum: ['Point'],
            default: 'Point',
          },
          coordinates: {
            type: [Number], // [longitude, latitude]
            required: true,
            index: '2dsphere',
          },
        },
      },
    ],
    // authProvider: {
    //   type: String,
    //   enum: AUTH_PROVIDERS,
    //   default: ['email'],
    // },
  },
  {
    timestamps: true,
  },
);

export default mongoose.model('User', userSchema);
