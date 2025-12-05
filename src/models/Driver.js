import mongoose from 'mongoose';
import { CAR_TYPES } from '../enums/vehicleEnums.js';
import {
  DRIVER_STATUS,
  DOCUMENT_STATUS,
  WAYBILL_STATUS,
} from '../enums/driverEnums.js';

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

const wayBillSchema = new mongoose.Schema(
  {
    imageUrl: {
      type: String,
      trim: true,
      default: '',
    },
    status: {
      type: String,
      enum: WAYBILL_STATUS,
      default: 'not_issued',
    },
  },
  { _id: false },
);

const certificateOfInsuranceSchema = new mongoose.Schema(
  {
    imageUrl: {
      type: String,
      trim: true,
      default: '',
    },
    insurer: {
      type: String,
      trim: true,
    },
    naic: {
      type: Number,
      trim: true,
    },
    policy: {
      type: String,
      trim: true,
    },
    operator: {
      type: String,
      trim: true,
    },
    policyStartDate: {
      type: Date,
      trim: true,
    },
    policyEndDate: {
      type: Date,
      trim: true,
    },
    coveredRideStartTime: {
      type: Date,
      trim: true,
    },
    status: {
      type: String,
      enum: WAYBILL_STATUS,
      default: 'not_issued',
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
      index: true,
    },
    vehicle: {
      type: {
        type: String,
        enum: CAR_TYPES,
      },
      model: {
        type: String,
        trim: true,
      },
      plateNumber: {
        type: String,
        trim: true,
      },
      color: {
        type: String,
        trim: true,
      },
      imageUrl: {
        type: String,
        trim: true,
        default: '',
      },
    },
    backgroundCheckStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'approved',
    },
    isBlocked: {
      type: Boolean,
      default: false,
      index: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    isApproved: {
      type: Boolean,
      default: false,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: false,
    },
    isSuspended: {
      type: Boolean,
      default: false,
      index: true,
    },
    suspensions: {
      type: [suspensionSchema],
      default: [],
    },
    wayBill: {
      certificateOfInsurance: {
        type: certificateOfInsuranceSchema,
        default: () => ({}),
      },
      recordCheckCertificate: {
        type: wayBillSchema,
        default: () => ({}),
      },
    },
    documents: {
      proofOfWork: {
        type: documentSchema,
        default: () => ({}),
      },
      profilePicture: {
        type: documentSchema,
        default: () => ({}),
      },
      driversLicense: {
        type: documentSchema,
        default: () => ({}),
      },
      commercialDrivingRecord: {
        type: documentSchema,
        default: () => ({}),
      },
      vehicleOwnerCertificateAndInsurance: {
        type: documentSchema,
        default: () => ({}),
      },
      vehicleInspection: {
        type: documentSchema,
        default: () => ({}),
      },
    },
    legalAgreemant: {
      type: Boolean,
      default: false,
    },
    isDestination: {
      type: Boolean,
      default: false,
    },
    destinationRide: {
      isActive: {
        type: Boolean,
        default: false,
        index: true,
      },
      startLocation: {
        coordinates: {
          type: [Number], // [longitude, latitude]
          index: '2dsphere',
        },
        address: {
          type: String,
          trim: true,
        },
        placeName: {
          type: String,
          trim: true,
        },
      },
      endLocation: {
        coordinates: {
          type: [Number], // [longitude, latitude]
          index: '2dsphere',
        },
        address: {
          type: String,
          trim: true,
        },
        placeName: {
          type: String,
          trim: true,
        },
      },
      activatedAt: {
        type: Date,
      },
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    isRestricted: {
      type: Boolean,
      default: false,
      index: true,
    },
    balance: {
      type: Number,
      default: 0,
      min: 0,
    },
    rideIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Ride',
      },
    ],
    payoutMethodIds: [
      {
        type: String,
      },
    ],
    stripeAccountId: {
      type: String,
      index: true,
    },
    defaultAccountId: {
      type: String,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

export default mongoose.model('Driver', driverSchema);
