import mongoose from 'mongoose';
import { USER_TYPES } from '../enums/userRoles.js';
import { GENDER_TYPES } from '../enums/genderEnums.js';

const notificationSchema = new mongoose.Schema(
  {
    payment: {
      type: Boolean,
      default: true,
    },
    tip: {
      type: Boolean,
      default: true,
    },
    cancellation: {
      type: Boolean,
      default: true,
    },
    call: {
      type: Boolean,
      default: true,
    },
    chat: {
      type: Boolean,
      default: true,
    },
    support: {
      type: Boolean,
      default: true,
    },
  },
  { _id: false },
);

const recoveryPhoneSchema = new mongoose.Schema({
  number: {
    type: String,
  },
});

const passkeySchema = new mongoose.Schema(
  {
    credentialID: String,
    publicKey: String,
    counter: Number,
    transports: [String],
  },
  { _id: false },
);

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
    recoveryPhoneNumbers: {
      type: [recoveryPhoneSchema],
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
    },
    gender: {
      type: String,
      enum: GENDER_TYPES,
      required: false,
    },
    passkeys: [passkeySchema],
    passkeyChallenge: {
      type: String,
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
    notifications: notificationSchema,
    userDeviceToken: {
      type: String,
      trim: true,
    },
    userDeviceType: {
      type: String,
      trim: true,
      default: 'ios',
    },
    userSocialToken: {
      type: String,
    },
  },
  {
    timestamps: true,
  },
);

export default mongoose.model('User', userSchema);
