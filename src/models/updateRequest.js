import mongoose from 'mongoose';
import { REQUEST_STATUS, REQUESTED_FIELD } from '../enums/requestStatus.js';

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
      required: true,
      trim: true,
    },
    new: {
      type: String,
      required: true,
      trim: true,
    },
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
  },
  { timestamps: true },
);

export default mongoose.model('UpdateRequest', schema);
