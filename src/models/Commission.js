import mongoose from 'mongoose';
import { CAR_TYPES } from '../enums/vehicleEnums.js';

const commissionSchema = new mongoose.Schema(
  {
    carType: {
      type: String,
      enum: CAR_TYPES,
      required: true,
    },
    percentage: {
      type: Number,
      min: 5,
      required: true,
    },
  },
  { timestamps: true },
);

export default mongoose.model('Commission', commissionSchema);
