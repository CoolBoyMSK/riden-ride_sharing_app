import RideModel from '../models/Ride.js';
import DriverLocationModel from '../models/DriverLocation.js';
import { generateUniqueId } from '../utils/auth.js';
import redisClient from '../config/redisConfig.js';
import env from '../config/envConfig.js';

// Ride Operations
export const createRide = async (rideData) => {
  const ride = new RideModel(rideData);
  ride.rideId = generateUniqueId('ride', ride._id);
  await ride.save();
  return ride;
};

export const findRideById = async (rideId, { session } = {}) => {
  let query = RideModel.findById(rideId)
    .populate('passengerId', 'userId isActive isBlocked')
    .populate('driverId', 'userId vehicle backgroundCheckStatus isBlocked');
  if (session) query = query.session(session);
  return await query.lean();
};

export const findRideByRideId = async (rideId, { session = null } = {}) => {
  let query = RideModel.findOne({ rideId })
    .populate('passengerId', 'userId isActive isBlocked')
    .populate('driverId', 'userId vehicle backgroundCheckStatus isBlocked');
  if (session) query = query.session(session);
  return await query.lean();
};

export const updateRideById = async (
  rideId,
  updateData,
  { session = null } = {},
) => {
  return await RideModel.findByIdAndUpdate(
    rideId,
    { ...updateData, updatedAt: new Date() },
    { new: true, session },
  );
};

export const updateRideByRideId = async (rideId, updateData) => {
  return await RideModel.findOneAndUpdate(
    { rideId },
    { ...updateData, updatedAt: new Date() },
    { new: true },
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
      $in: [
        'REQUESTED',
        'DRIVER_ASSIGNED',
        'DRIVER_ARRIVING',
        'DRIVER_ARRIVED',
        'RIDE_STARTED',
        'RIDE_IN_PROGRESS',
      ],
    },
  })
    .populate('driverId', 'userId vehicle')
    .lean();
};

// Find current active ride for driver
export const findActiveRideByDriver = async (driverId) => {
  return await RideModel.findOne({
    driverId,
    status: {
      $in: [
        'DRIVER_ASSIGNED',
        'DRIVER_ARRIVING',
        'DRIVER_ARRIVED',
        'RIDE_STARTED',
        'RIDE_IN_PROGRESS',
      ],
    },
  })
    .populate('passengerId', 'userId')
    .lean();
};

// Find pending rides (for driver matching)
export const findPendingRides = async (
  carType,
  location,
  radius = 5000,
  { excludeIds = [], projection = null, limit = 0, session = null } = {},
) => {
  const query = {
    status: 'REQUESTED',
    carType,
    'pickupLocation.coordinates': {
      $near: {
        $geometry: { type: 'Point', coordinates: location },
        $maxDistance: radius,
      },
    },
  };
  if (excludeIds.length) {
    query._id = { $nin: excludeIds };
  }

  let q = RideModel.find(query, projection)
    .limit(limit)
    .populate('passengerId', 'userId')
    .sort({ requestedAt: 1 });

  if (session) q = q.session(session);

  return await q.lean();
};

// Driver Location Operations
export const upsertDriverLocation = async (
  driverId,
  locationData,
  options = {},
) => {
  let query = DriverLocationModel.findOneAndUpdate(
    { driverId },
    {
      ...locationData,
      status: 'ONLINE',
      isAvailable: true,
      lastUpdated: new Date(),
    },
    {
      new: true,
      upsert: true,
      ...options,
    },
  );

  if (options.session) query = query.session(options.session);

  return query;
};

export const findDriverLocation = async (driverId, { session = null } = {}) => {
  let query = DriverLocationModel.findOne({ driverId });
  if (session) query = query.session(session);
  return await query.lean();
};

// Find available drivers near pickup location
export const findAvailableDriversNearby = async (
  pickupLocation,
  carType,
  radius = 5000,
) => {
  return await DriverLocationModel.find({
    status: 'ONLINE',
    isAvailable: true,
    location: {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: pickupLocation,
        },
        $maxDistance: radius,
      },
    },
  })
    .populate({
      path: 'driverId',
      match: {
        'vehicle.type': carType,
        isBlocked: false,
        isDeleted: false,
        backgroundCheckStatus: 'approved',
      },
      select: 'userId vehicle backgroundCheckStatus',
    })
    .lean();
};

// Update driver availability
export const updateDriverAvailability = async (
  driverId,
  isAvailable,
  currentRideId = null,
  { session } = {},
) => {
  return await DriverLocationModel.findOneAndUpdate(
    { driverId },
    {
      isAvailable,
      currentRideId,
      lastUpdated: new Date(),
    },
    { new: true, session },
  );
};

// Get ride statistics
export const getRideStats = async (passengerId, startDate, endDate) => {
  const matchStage = { passengerId };

  if (startDate && endDate) {
    matchStage.requestedAt = {
      $gte: new Date(startDate),
      $lte: new Date(endDate),
    };
  }

  return await RideModel.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalRides: { $sum: 1 },
        completedRides: {
          $sum: { $cond: [{ $eq: ['$status', 'RIDE_COMPLETED'] }, 1, 0] },
        },
        cancelledRides: {
          $sum: {
            $cond: [
              {
                $in: [
                  '$status',
                  [
                    'CANCELLED_BY_PASSENGER',
                    'CANCELLED_BY_DRIVER',
                    'CANCELLED_BY_SYSTEM',
                  ],
                ],
              },
              1,
              0,
            ],
          },
        },
        totalSpent: {
          $sum: {
            $cond: [
              { $eq: ['$status', 'RIDE_COMPLETED'] },
              '$fareBreakdown.finalAmount',
              0,
            ],
          },
        },
        totalDistance: {
          $sum: {
            $cond: [
              { $eq: ['$status', 'RIDE_COMPLETED'] },
              '$actualDistance',
              0,
            ],
          },
        },
      },
    },
  ]);
};

export const deleteRide = async (rideId) => {
  return await RideModel.findByIdAndDelete(rideId);
};

// Redis-based Driver Location Caching
const getRedis = () => redisClient;
const redis = () => getRedis();
const driverLocationKey = (driverId) => `driver:${driverId}:location`;

export const saveDriverLocation = async (
  driverId,
  { lng, lat, isAvailable = true, speed, heading },
) => {
  const key = driverLocationKey(driverId);
  const payload = JSON.stringify({
    coordinates: [lng, lat],
    updatedAt: Date.now(),
    isAvailable,
    speed,
    heading,
  });
  await redis().set(
    key,
    payload,
    'EX',
    parseInt(env.LOCATION_TTL_SECONDS || '60'),
  );
  return true;
};

export const getDriverLocation = async (driverId) => {
  const key = driverLocationKey(driverId);
  const data = await redis().get(key);
  return data ? JSON.parse(data) : null;
};

// Periodic flush of location to DB (call from a scheduled job)
export const persistDriverLocationToDB = async (driverId, { session } = {}) => {
  const data = await getDriverLocation(driverId);
  if (!data) return null;
  // data.coordinates is [lng, lat]
  return upsertDriverLocation(
    driverId,
    {
      location: { type: 'Point', coordinates: data.coordinates },
      speed: data.speed,
      heading: data.heading,
    },
    session,
  );
};

export const findNearbyRideRequests = async (
  driverDestinationCoords,
  radiusKm = 5,
) => {
  const radiusInRadians = radiusKm / 6378.1;

  const rideRequests = await RideModel.find({
    dropoff: {
      $geoWithin: {
        $centerSphere: [driverDestinationCoords, radiusInRadians],
      },
    },
    status: 'requested',
  });

  return rideRequests;
};
