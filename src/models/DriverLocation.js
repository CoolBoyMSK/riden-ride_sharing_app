import mongoose from 'mongoose';
import { DRIVER_STATUS } from '../enums/driver.js';

const driverLocationSchema = new mongoose.Schema(
  {
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Driver',
      required: true,
      unique: true,
      index: true,
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
      },
    },
    status: {
      type: String,
      enum: DRIVER_STATUS,
      default: 'offline',
      index: true,
    },
    isAvailable: {
      type: Boolean,
      default: false,
      index: true,
    },
    currentRideId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ride',
    },
    parkingQueueId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ParkingQueue',
    },
    heading: {
      type: Number, // Direction in degrees (0-360)
      min: 0,
      max: 360,
    },
    speed: {
      type: Number, // Speed in km/h
      min: 0,
    },
    accuracy: {
      type: Number, // GPS accuracy in meters
      min: 0,
    },
    lastUpdated: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

// Compound indexes for efficient queries
driverLocationSchema.index({
  location: '2dsphere',
  status: 1,
  isAvailable: 1,
});

export default mongoose.model('DriverLocation', driverLocationSchema);
