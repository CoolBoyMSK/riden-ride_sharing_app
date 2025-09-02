import mongoose from 'mongoose';
import { DRIVER_STATUS } from '../enums/rideStatus.js';

const driverLocationSchema = new mongoose.Schema({
  driverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Driver',
    required: true,
    unique: true,
    index: true
  },
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: true,
      index: '2dsphere'
    }
  },
  status: {
    type: String,
    enum: DRIVER_STATUS,
    default: 'OFFLINE',
    index: true
  },
  isAvailable: {
    type: Boolean,
    default: false,
    index: true
  },
  currentRideId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Ride'
  },
  heading: {
    type: Number, // Direction in degrees (0-360)
    min: 0,
    max: 360
  },
  speed: {
    type: Number, // Speed in km/h
    min: 0
  },
  accuracy: {
    type: Number, // GPS accuracy in meters
    min: 0
  },
  lastUpdated: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

// Compound indexes for efficient queries
driverLocationSchema.index({ 
  'location': '2dsphere', 
  'status': 1, 
  'isAvailable': 1 
});
driverLocationSchema.index({ 
  'driverId': 1, 
  'lastUpdated': -1 
});

// TTL index to automatically remove old location data
driverLocationSchema.index({ 
  'lastUpdated': 1 
}, { 
  expireAfterSeconds: 86400 // 24 hours
});

export default mongoose.model('DriverLocation', driverLocationSchema);



