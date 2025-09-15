import mongoose from 'mongoose';
import { CAR_TYPES } from '../enums/carType.js';
import { DRIVER_STATUS, DOCUMENT_STATUS } from '../enums/driver.js';

const suspensionSchema = new mongoose.Schema(
  {
    reason: {
      type: String,
      required: true,
      trim: true,
    },
    start: {
      type: Date,
      required: true,
      default: () => new Date(),
    },
    end: {
      type: Date,
      required: true,
    },
  },
  { _id: false },
);

const documentSchema = new mongoose.Schema(
  {
    imageUrl: {
      type: String,
      trim: true,
      default: '',
    },
    status: {
      type: String,
      enum: DOCUMENT_STATUS,
      default: 'not_submitted',
    },
  },
  { _id: false },
);

const driverSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      unique: true,
      required: true,
    },
    uniqueId: {
      type: String,
      unique: true,
      required: true,
    },
    status: {
      type: String,
      enum: DRIVER_STATUS,
      default: 'offline',
    },
    vehicle: {
      type: { type: String, enum: CAR_TYPES },
      model: { type: String, trim: true },
      plateNumber: { type: String, trim: true },
      color: { type: String, trim: true },
      imageUrl: {
        type: String,
        trim: true,
        default: '',
      },
    },
    backgroundCheckStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    payoutDetails: {
      bankAccount: { type: String, trim: true },
      ifscCode: { type: String, trim: true },
    },
    isBlocked: {
      type: Boolean,
      default: false,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    isApproved: {
      type: Boolean,
      default: false,
    },
    suspensions: {
      type: [suspensionSchema],
      default: [],
    },
    documents: {
      proofOfWork: { type: documentSchema, default: () => ({}) },
      profilePicture: { type: documentSchema, default: () => ({}) },
      driversLicense: { type: documentSchema, default: () => ({}) },
      commercialDrivingRecord: { type: documentSchema, default: () => ({}) },
      vehicleOwnerCertificateAndInsurance: {
        type: documentSchema,
        default: () => ({}),
      },
      vehicleInspection: { type: documentSchema, default: () => ({}) },
    },
    legalAgreemant: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

export default mongoose.model('Driver', driverSchema);
