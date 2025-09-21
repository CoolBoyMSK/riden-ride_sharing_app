import RideModel from '../models/Ride.js';
import DriverLocationModel from '../models/DriverLocation.js';
import DriverModel from '../models/Driver.js';
import ChatRoomModel from '../models/ChatRoom.js';
import { generateUniqueId } from '../utils/auth.js';
import redisClient from '../config/redisConfig.js';
import env from '../config/envConfig.js';
import { RESTRICTED_AREA } from '../enums/restrictedArea.js';
import ParkingQueue from '../models/ParkingQueue.js';
import mongoose from 'mongoose';

// Ride Operations
export const createRide = async (rideData) => {
  const ride = new RideModel(rideData);
  ride.rideId = generateUniqueId('ride', ride._id);

  const room = await ChatRoomModel.create({
    passengerId: ride.passengerId,
    rideId: ride._id,
    type: 'RIDE',
  });

  ride.chatRoomId = room._id;
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
    .populate('passengerId')
    .populate('driverId');
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
    .populate('driverId')
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
    .populate('passengerId')
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
    .populate('driverId')
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
    .populate('passengerId')
    .lean();
};

// Find pending rides (for driver matching)
export const findPendingRides = async (
  carType,
  location,
  radius = 10000,
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

  console.log('Query');
  console.log(query);

  if (excludeIds.length) {
    query._id = { $nin: excludeIds };
  }

  let q = await RideModel.find(query)
    .limit(limit)
    .populate('passengerId')
    .sort({ requestedAt: 1 });

  console.log('DB Return');
  console.log(q);

  return q;
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
  radius = 10000,
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
  driverDestinationCoords, // [lng, lat]
  driverCurrentCoords, // [lng, lat]
  radiusKm = 5,
  limit = 10,
) => {
  const radiusMeters = radiusKm * 1000;

  const rides = await RideModel.aggregate([
    // Step 1: GeoNear to sort by pickup distance from driver
    {
      $geoNear: {
        near: { type: 'Point', coordinates: driverCurrentCoords },
        key: 'pickupLocation.coordinates', // must have 2dsphere index
        distanceField: 'distanceFromDriver',
        query: { status: 'REQUESTED' }, // only requested rides
        spherical: true,
      },
    },

    // Step 2: Filter rides whose dropoff is within radiusKm of driverDestination
    {
      $match: {
        'dropoffLocation.coordinates': {
          $geoWithin: {
            $centerSphere: [driverDestinationCoords, radiusKm / 6378.1], // radius in radians
          },
        },
      },
    },

    // Step 3: Limit results for performance
    { $limit: limit },
  ]);

  return rides;
};

export const haversineDistance = (coord1, coord2) => {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371; // Earth radius in km

  const dLat = toRad(coord2.latitude - coord1.latitude);
  const dLon = toRad(coord2.longitude - coord1.longitude);

  const lat1Rad = toRad(coord1.latitude);
  const lat2Rad = toRad(coord2.latitude);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
};

export const isDriverInParkingLot = (driverCoords, parkingRadiusKm = 1) => {
  for (const area of RESTRICTED_AREA) {
    for (const lot of area.parkingLots) {
      const distance = haversineDistance(driverCoords, lot.coordinates);
      if (distance <= parkingRadiusKm) return true;
    }
  }
  return false;
};

export const isRideInRestrictedArea = (rideCoords, restrictedRadiusKm = 10) => {
  for (const area of RESTRICTED_AREA) {
    const distance = haversineDistance(rideCoords, area.airportCoordinates);
    if (distance <= restrictedRadiusKm) return true;
  }
  return false;
};

export const filterRidesForDriver = (
  rides,
  driverCoords,
  restrictedRadiusKm = 10,
  parkingRadiusKm = 1,
) => {
  if (!Array.isArray(rides)) return [];

  const driverInParking = isDriverInParkingLot(driverCoords, parkingRadiusKm);
  return rides.filter((ride) => {
    if (!ride.pickupLocation || !Array.isArray(ride.pickupLocation.coordinates))
      return false;

    const [lng, lat] = ride.pickupLocation.coordinates;
    const rideCoords = { latitude: lat, longitude: lng };

    if (driverInParking) return true;

    return !isRideInRestrictedArea(rideCoords, restrictedRadiusKm);
  });
};

export const findNearestParkingForPickup = (userCoords, radiusKm = 10) => {
  // Normalize coordinates
  if (Array.isArray(userCoords) && userCoords.length === 2) {
    userCoords = {
      latitude: Number(userCoords[1]),
      longitude: Number(userCoords[0]),
    };
  }

  // Validate coordinates
  if (
    !userCoords ||
    typeof userCoords.latitude !== 'number' ||
    typeof userCoords.longitude !== 'number'
  ) {
    throw new Error('Invalid user coordinates.');
  }

  let nearest = null;

  for (const airport of RESTRICTED_AREA) {
    for (const lot of airport.parkingLots) {
      const distance = haversineDistance(userCoords, lot.coordinates);

      if (distance <= radiusKm) {
        if (!nearest || distance < nearest.distanceKm) {
          nearest = {
            airportName: airport.name,
            parkingLotName: lot.name,
            parkingLotId: lot.id,
            coordinates: lot.coordinates,
            distanceKm: Number(distance.toFixed(3)),
          };
        }
      }
    }
  }

  if (!nearest) return null;

  const { latitude, longitude } = nearest.coordinates;

  return {
    ...nearest,
    googleMapsUrl: `https://www.google.com/maps/dir/?api=1&origin=${userCoords.latitude},${userCoords.longitude}&destination=${latitude},${longitude}&travelmode=driving`,
    appleMapsUrl: `http://maps.apple.com/?saddr=${userCoords.latitude},${userCoords.longitude}&daddr=${latitude},${longitude}`,
  };
};

export const addDriverToQueue = async (parkingLotId, driverId) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Atomically add driverId only if not already in the array
    const updated = await ParkingQueue.findOneAndUpdate(
      { parkingLotId },
      { $addToSet: { driverIds: driverId } }, // $addToSet ensures no duplicates
      { new: true, session },
    );

    if (!updated) {
      throw new Error(`Parking lot with ID ${parkingLotId} not found.`);
    }

    await session.commitTransaction();
    return {
      message: `Driver successfully added to parking lot queue ${parkingLotId} (or already present).`,
      driverIds: updated.driverIds,
    };
  } catch (err) {
    await session.abortTransaction();
    throw new Error(`Failed to add driver to queue: ${err.message}`);
  } finally {
    session.endSession();
  }
};

export const removeDriverFromQueue = async (driverId, session = null) => {
  const useSession = session || (await mongoose.startSession());
  if (!session) useSession.startTransaction();

  try {
    const driverObjectId =
      typeof driverId === 'string'
        ? mongoose.Types.ObjectId(driverId)
        : driverId;

    // Remove driver from all queues
    const result = await ParkingQueue.updateMany(
      {}, // empty filter → all documents
      { $pull: { driverIds: driverObjectId } },
      { session: useSession },
    );

    if (!session) await useSession.commitTransaction();
    console.log('Driver removed from queues:', result.modifiedCount);
    return result;
  } catch (err) {
    if (!session) await useSession.abortTransaction();
    throw new Error(`Failed to remove driver from queues: ${err.message}`);
  } finally {
    if (!session) useSession.endSession();
  }
};

const OFFER_TIMEOUT_MS = 180000;

export const offerRideToParkingQueue = async (
  ride,
  io,
  declinedDrivers = new Set(),
) => {
  try {
    if (!ride) return;

    const parkingLot = findNearestParkingForPickup(
      ride.pickupLocation.coordinates,
    );
    if (!parkingLot) return;

    const queue = await ParkingQueue.findOne({
      parkingLotId: parkingLot.parkingLotId,
    });
    if (!queue || queue.driverIds.length === 0) return; // No driver available

    // Find the first driver in queue who hasn't declined yet
    const driverId = queue.driverIds.find(
      (id) => !declinedDrivers.has(id.toString()),
    );
    if (!driverId) return; // All drivers declined

    const driver = await DriverModel.findById(driverId);
    if (!driver) return;

    // Emit ride offer to driver
    io.to(`user:${driver.userId}`).emit('ride:response', {
      success: true,
      ride,
      message: 'Airport ride offer',
    });

    // Define response handler
    const responseHandler = async ({ driverResponse }) => {
      io.off(`ride:response:${ride._id}:${driverId}`, responseHandler); // remove listener first
      try {
        await handleDriverResponse(
          ride._id,
          driverId,
          driverResponse,
          io,
          declinedDrivers,
        );
      } catch (err) {
        console.error('Error in driver response handler:', err);
      }
    };

    // Listen for driver response
    io.on(`ride:response:${ride._id}:${driverId}`, responseHandler);

    // Timeout handling: if driver does not respond in time, rotate queue
    setTimeout(async () => {
      io.off(`ride:response:${ride._id}:${driverId}`, responseHandler);

      const updatedRide = await RideModel.findById(ride._id);
      if (updatedRide && updatedRide.status === 'REQUESTED') {
        declinedDrivers.add(driverId.toString());
        await rotateQueue(parkingLot.parkingLotId, driverId);
        offerRideToParkingQueue(ride, io, declinedDrivers);
      }
    }, OFFER_TIMEOUT_MS);
  } catch (error) {
    return error;
  }
};

async function rotateQueue(parkingLotId, driverId) {
  if (!driverId || !parkingLotId) return;

  const driver = await DriverModel.findById(driverId);
  console.log('driver');
  console.log(driver);

  await ParkingQueue.findOneAndUpdate(
    { parkingLotId },
    { $pull: { driverIds: driver._id } },
  );

  await ParkingQueue.findOneAndUpdate(
    { parkingLotId },
    { $push: { driverIds: driver._id } },
  );
}

export const handleDriverResponse = async (
  rideId,
  driverId,
  driverResponse,
  io,
  socket,
  objectType,
  declinedDrivers = new Set(),
) => {
  try {
    if (!rideId || !driverId) return;

    const ride = await RideModel.findById(rideId);
    if (!ride || ride.status !== 'REQUESTED') return; // Already assigned

    const parkingLot = findNearestParkingForPickup(
      ride.pickupLocation.coordinates,
    );
    if (!parkingLot) return;

    const driver = await DriverModel.findById(driverId);
    if (!driver) return;

    const objectDriverId = driver._id;

    if (driverResponse === 'accepted') {
      // Update ride, driver, and location atomically
      const updatedRide = await RideModel.findByIdAndUpdate(
        rideId,
        { status: 'DRIVER_ASSIGNED', driverId, driverAssignedAt: new Date() },
        { new: true },
      );

      await Promise.all([
        DriverModel.findByIdAndUpdate(driverId, { status: 'on_ride' }),
        DriverLocationModel.findOneAndUpdate(
          { driverId },
          {
            isAvailable: false,
            currentRideId: rideId,
            lastUpdated: new Date(),
          },
        ),
        ParkingQueue.findOneAndUpdate(
          { parkingLotId: parkingLot.parkingLotId },
          { $pull: { driverIds: objectDriverId } },
        ),
      ]);

      socket.join(`ride:${updatedRide._id}`);
      socket.emit('ride:response', {
        rideId,
        message: 'Successfully joined ride room',
      });

      // Notify driver
      socket.emit('ride:response', {
        success: true,
        objectType,
        ride: updatedRide,
        message: 'Ride successfully assigned to you',
      });

      // Notify passenger
      io.to(`user:${ride.passengerId}`).emit('ride:response', {
        rideId: updatedRide.rideId,
        status: 'DRIVER_ASSIGNED',
        data: {
          ride: updatedRide,
          driver,
        },
      });
    } else {
      // Declined → rotate queue and offer to next driver
      declinedDrivers.add(driverId.toString());
      await rotateQueue(parkingLot.parkingLotId, driverId);
      offerRideToParkingQueue(ride, io, declinedDrivers);

      // Notify driver
      socket.emit('ride:response', {
        success: true,
        objectType,
        rideId,
        message: 'You declined the ride',
      });
    }
  } catch (error) {
    return error;
  }
};
