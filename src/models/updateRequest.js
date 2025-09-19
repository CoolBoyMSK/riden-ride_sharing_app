import mongoose from 'mongoose';
import { REQUEST_STATUS, REQUESTED_FIELD } from '../enums/requestStatus.js';
import { CAR_TYPES } from '../enums/carType.js';

const requestSchema = new mongoose.Schema(
  {
    field: {
      type: String,
      enum: REQUESTED_FIELD,
      default: 'name',
    },
    reason: {
      type: String,
      default: function () {
        const capitalized =
          this.field.charAt(0).toUpperCase() + this.field.slice(1);
        return `${capitalized} Edit Request`;
      },
    },
    old: {
      type: String,
      trim: true,
      default: null,
    },
    new: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { _id: false },
);

const vehicleSchema = new mongoose.Schema(
  {
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
  { _id: false },
);

const vehicleRequestSchema = new mongoose.Schema(
  {
    new: vehicleSchema,
    old: vehicleSchema,
  },
  { _id: false },
);

const schema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    status: {
      type: String,
      enum: REQUEST_STATUS,
      default: 'pending',
    },
    request: requestSchema,
    vehicleRequest: { type: vehicleRequestSchema, default: null },
  },
  { timestamps: true },
);

export default mongoose.model('UpdateRequest', schema);
