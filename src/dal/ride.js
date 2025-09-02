import RideModel from '../models/Ride.js';
import DriverLocationModel from '../models/DriverLocation.js';

// Ride Operations
export const createRide = async (rideData) => {
  const ride = new RideModel(rideData);
  return await ride.save();
};

export const findRideById = async (rideId) => {
  return await RideModel.findById(rideId)
    .populate('passengerId', 'userId isActive isBlocked')
    .populate('driverId', 'userId vehicle backgroundCheckStatus isBlocked')
    .lean();
};

export const findRideByRideId = async (rideId) => {
  return await RideModel.findOne({ rideId })
    .populate('passengerId', 'userId isActive isBlocked')
    .populate('driverId', 'userId vehicle backgroundCheckStatus isBlocked')
    .lean();
};

export const updateRideById = async (rideId, updateData) => {
  return await RideModel.findByIdAndUpdate(
    rideId, 
    { ...updateData, updatedAt: new Date() }, 
    { new: true }
  );
};

export const updateRideByRideId = async (rideId, updateData) => {
  return await RideModel.findOneAndUpdate(
    { rideId }, 
    { ...updateData, updatedAt: new Date() }, 
    { new: true }
  );
};

// Find rides by passenger
export const findRidesByPassenger = async (passengerId, options = {}) => {
  const { page = 1, limit = 10, status } = options;
  const skip = (page - 1) * limit;
  
  const query = { passengerId };
  if (status) {
    query.status = status;
  }
  
  return await RideModel.find(query)
    .populate('driverId', 'userId vehicle')
    .sort({ requestedAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();
};

// Find rides by driver
export const findRidesByDriver = async (driverId, options = {}) => {
  const { page = 1, limit = 10, status } = options;
  const skip = (page - 1) * limit;
  
  const query = { driverId };
  if (status) {
    query.status = status;
  }
  
  return await RideModel.find(query)
    .populate('passengerId', 'userId')
    .sort({ requestedAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();
};

// Find current active ride for passenger
export const findActiveRideByPassenger = async (passengerId) => {
  return await RideModel.findOne({
    passengerId,
    status: {
      $in: ['REQUESTED', 'DRIVER_ASSIGNED', 'DRIVER_ARRIVING', 'DRIVER_ARRIVED', 'RIDE_STARTED', 'RIDE_IN_PROGRESS']
    }
  })
  .populate('driverId', 'userId vehicle')
  .lean();
};

// Find current active ride for driver
export const findActiveRideByDriver = async (driverId) => {
  return await RideModel.findOne({
    driverId,
    status: {
      $in: ['DRIVER_ASSIGNED', 'DRIVER_ARRIVING', 'DRIVER_ARRIVED', 'RIDE_STARTED', 'RIDE_IN_PROGRESS']
    }
  })
  .populate('passengerId', 'userId')
  .lean();
};

// Find pending rides (for driver matching)
export const findPendingRides = async (carType, location, radius = 5000) => {
  return await RideModel.find({
    status: 'REQUESTED',
    carType,
    'pickupLocation.coordinates': {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: location
        },
        $maxDistance: radius // in meters
      }
    }
  })
  .populate('passengerId', 'userId')
  .sort({ requestedAt: 1 })
  .lean();
};

// Driver Location Operations
export const upsertDriverLocation = async (driverId, locationData) => {
  return await DriverLocationModel.findOneAndUpdate(
    { driverId },
    { 
      ...locationData, 
      lastUpdated: new Date() 
    },
    { 
      new: true, 
      upsert: true 
    }
  );
};

export const findDriverLocation = async (driverId) => {
  return await DriverLocationModel.findOne({ driverId }).lean();
};

// Find available drivers near pickup location
export const findAvailableDriversNearby = async (pickupLocation, carType, radius = 5000) => {
  return await DriverLocationModel.find({
    status: 'ONLINE',
    isAvailable: true,
    location: {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: pickupLocation
        },
        $maxDistance: radius
      }
    }
  })
  .populate({
    path: 'driverId',
    match: { 
      'vehicle.type': carType,
      isBlocked: false,
      isDeleted: false,
      backgroundCheckStatus: 'approved'
    },
    select: 'userId vehicle backgroundCheckStatus'
  })
  .lean();
};

// Update driver availability
export const updateDriverAvailability = async (driverId, isAvailable, currentRideId = null) => {
  return await DriverLocationModel.findOneAndUpdate(
    { driverId },
    { 
      isAvailable,
      currentRideId,
      lastUpdated: new Date()
    },
    { new: true }
  );
};

// Get ride statistics
export const getRideStats = async (passengerId, startDate, endDate) => {
  const matchStage = { passengerId };
  
  if (startDate && endDate) {
    matchStage.requestedAt = {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    };
  }
  
  return await RideModel.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalRides: { $sum: 1 },
        completedRides: {
          $sum: { $cond: [{ $eq: ['$status', 'RIDE_COMPLETED'] }, 1, 0] }
        },
        cancelledRides: {
          $sum: { $cond: [{ $in: ['$status', ['CANCELLED_BY_PASSENGER', 'CANCELLED_BY_DRIVER', 'CANCELLED_BY_SYSTEM']] }, 1, 0] }
        },
        totalSpent: {
          $sum: { $cond: [{ $eq: ['$status', 'RIDE_COMPLETED'] }, '$fareBreakdown.finalAmount', 0] }
        },
        totalDistance: {
          $sum: { $cond: [{ $eq: ['$status', 'RIDE_COMPLETED'] }, '$actualDistance', 0] }
        }
      }
    }
  ]);
};

export const deleteRide = async (rideId) => {
  return await RideModel.findByIdAndDelete(rideId);
};



