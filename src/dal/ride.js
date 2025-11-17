import RideModel from '../models/Ride.js';
import DriverLocationModel from '../models/DriverLocation.js';
import DriverModel from '../models/Driver.js';
import ChatRoomModel from '../models/ChatRoom.js';
import { generateUniqueId } from '../utils/auth.js';
import redisClient from '../config/redisConfig.js';
import { RESTRICTED_AREA } from '../enums/restrictedArea.js';
import ParkingQueue from '../models/ParkingQueue.js';
import mongoose, { Error } from 'mongoose';
import Feedback from '../models/Feedback.js';
import Commission from '../models/Commission.js';
import AdminCommission from '../models/AdminCommission.js';
import RideTransaction from '../models/RideTransaction.js';
import moment from 'moment';
import Ride from '../models/Ride.js';
import Fare from '../models/fareManagement.js';
import Zone from '../models/Zone.js';
import { emitToUser } from '../realtime/socket.js';

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
  const result = await RideModel.findByIdAndUpdate(
    rideId,
    { ...updateData, updatedAt: new Date() },
    { new: true, session },
  ).populate([
    {
      path: 'driverId',
      populate: { path: 'userId' }, // populate driverId.userId
    },
    {
      path: 'passengerId',
      populate: { path: 'userId' }, // populate passengerId.userId
    },
    { path: 'passengerRating' },
    { path: 'driverRating' },
    { path: 'chatRoomId' }, // simple top-level ref
  ]);

  return result;
};

export const createFeedback = async (payload) => Feedback.create(payload);

export const updateRideByRideId = async (rideId, updateData) => {
  return await RideModel.findOneAndUpdate(
    { rideId },
    { ...updateData, updatedAt: new Date() },
    { new: true },
  );
};

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

export const findPendingAirportRides = async (
  carType,
  parkingLotId,
  { excludeIds = [], projection = null, limit = 20, session = null } = {},
) => {
  // Get the parking queue and airport zone with proper validation
  const queue = await ParkingQueue.findOne({
    parkingLotId,
    isActive: true,
  })
    .populate({
      path: 'airportId',
      match: {
        type: 'airport',
        isActive: true,
        boundaries: { $exists: true, $ne: null },
      },
    })
    .populate('parkingLotId')
    .session(session || null)
    .lean();

  console.log('Parking Queue: ', queue);

  if (!queue) {
    throw new Error(`Parking queue not found or inactive`);
  }

  if (!queue.airportId) {
    throw new Error(`Associated airport not found for parking queue`);
  }

  const airport = queue.airportId;

  // Validate airport boundaries structure
  if (
    !airport.boundaries ||
    !airport.boundaries.coordinates ||
    !Array.isArray(airport.boundaries.coordinates) ||
    airport.boundaries.coordinates.length === 0
  ) {
    throw new Error('Invalid airport boundaries structure');
  }

  const query = {
    status: 'REQUESTED',
    carType,
    'pickupLocation.coordinates': {
      $geoWithin: {
        $geometry: {
          type: 'Polygon',
          coordinates: airport.boundaries.coordinates,
        },
      },
    },
    isAirport: true,
  };

  if (excludeIds.length > 0) {
    query._id = { $nin: excludeIds };
  }

  console.log(
    `Searching for rides within airport: ${airport.name}, carType: ${carType}`,
  );

  let q = RideModel.find(query)
    .limit(limit)
    .populate([
      {
        path: 'driverId',
        populate: { path: 'userId' },
      },
      {
        path: 'passengerId',
        populate: { path: 'userId' },
      },
      { path: 'chatRoomId' },
    ])
    .sort({ requestedAt: 1 }); // Oldest requests first

  if (projection) {
    q = q.select(projection);
  }

  if (session) {
    q = q.session(session);
  }

  const rides = await q;

  console.log(`Found ${rides.length} pending rides within airport boundaries`);
  return rides;
};

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
    isAirport: false,
  };

  if (excludeIds.length) {
    query._id = { $nin: excludeIds };
  }

  let q = await RideModel.find(query)
    .limit(limit)
    .populate([
      {
        path: 'driverId',
        populate: { path: 'userId' }, // populate driverId.userId
      },
      {
        path: 'passengerId',
        populate: { path: 'userId' }, // populate passengerId.userId
      },
      { path: 'chatRoomId' }, // simple top-level ref
    ])
    .sort({ requestedAt: 1 });

  return q;
};

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
  { lng, lat, status, parkingQueueId, isAvailable, speed, heading },
) => {
  const key = driverLocationKey(driverId);
  const payload = JSON.stringify({
    coordinates: [lng, lat],
    status,
    parkingQueueId,
    isAvailable,
    speed,
    heading,
    updatedAt: Date.now(),
  });
  await redis().set(key, payload);
  return true;
};

export const removeDriverLocation = async (driverId) => {
  await redis().del(driverLocationKey(driverId));
};

export const getDriverLocation = async (driverId) => {
  const key = driverLocationKey(driverId);
  const data = await redis().get(key);
  return data ? JSON.parse(data) : null;
};

export const persistDriverLocationToDB = async (driverId, { session } = {}) => {
  const data = await getDriverLocation(driverId);
  console.log('Persisting Driver Location to DB:', data);
  if (!data) return null;
  return upsertDriverLocation(
    driverId,
    {
      location: { type: 'Point', coordinates: data.coordinates },
      status: data.status,
      parkingQueueId: data.parkingQueueId,
      isAvailable: data.isAvailable,
      speed: data.speed,
      heading: data.heading,
    },
    session,
  );
};

export const upsertDriverLocation = async (
  driverId,
  locationData,
  options = {},
) => {
  let query = DriverLocationModel.findOneAndUpdate(
    { driverId },
    {
      ...locationData,
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

// export const isDriverInParkingLot = (driverCoords, parkingRadiusKm = 1) => {
//   for (const area of RESTRICTED_AREA) {
//     for (const lot of area.parkingLots) {
//       const distance = haversineDistance(driverCoords, lot.coordinates);
//       if (distance <= parkingRadiusKm) return true;
//     }
//   }
//   return false;
// };

export const isDriverInParkingLot = async (coords) => {
  if (
    !Array.isArray(coords) ||
    coords.length !== 2 ||
    typeof coords[0] !== 'number' ||
    typeof coords[1] !== 'number'
  ) {
    throw new Error(`Invalid coordinates provided: ${JSON.stringify(coords)}`);
  }

  const zone = await Zone.findOne({
    boundaries: {
      $geoIntersects: {
        $geometry: {
          type: 'Point',
          coordinates: coords,
        },
      },
    },
    isActive: true,
    type: 'airport-parking',
  }).lean();

  if (zone) {
    return zone;
  } else {
    return false;
  }
};

export const isRideInRestrictedArea = async (coords) => {
  if (
    !Array.isArray(coords) ||
    coords.length !== 2 ||
    typeof coords[0] !== 'number' ||
    typeof coords[1] !== 'number'
  ) {
    throw new Error(`Invalid coordinates provided: ${JSON.stringify(coords)}`);
  }

  const zone = await Zone.findOne({
    boundaries: {
      $geoIntersects: {
        $geometry: {
          type: 'Point',
          coordinates: coords,
        },
      },
    },
    isActive: true,
    type: 'airport',
  }).lean();

  if (zone) {
    return true;
  } else {
    return false;
  }
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

const calculatePolygonCentroid = (coordinates) => {
  try {
    const polygonRing = coordinates[0]; // Outer ring
    if (!polygonRing || polygonRing.length < 3) {
      throw new Error('Invalid polygon - not enough points');
    }

    let signedArea = 0;
    let centroidLng = 0;
    let centroidLat = 0;

    // Use the shoelace formula for more accurate centroid calculation
    for (let i = 0; i < polygonRing.length - 1; i++) {
      const [x1, y1] = polygonRing[i];
      const [x2, y2] = polygonRing[i + 1];

      const crossProduct = x1 * y2 - x2 * y1;
      signedArea += crossProduct;

      centroidLng += (x1 + x2) * crossProduct;
      centroidLat += (y1 + y2) * crossProduct;
    }

    signedArea *= 0.5;

    if (Math.abs(signedArea) < 0.0001) {
      // Very small area, fallback to simple average
      return calculatePolygonCenter(coordinates);
    }

    centroidLng = centroidLng / (6 * signedArea);
    centroidLat = centroidLat / (6 * signedArea);

    console.log(
      `Calculated accurate centroid: [${centroidLng}, ${centroidLat}]`,
    );

    return {
      latitude: centroidLat,
      longitude: centroidLng,
    };
  } catch (error) {
    console.error('Error calculating polygon centroid:', error);
    return calculatePolygonCenter(coordinates); // Fallback to simple average
  }
};

export const findNearestParkingForPickup = async (userCoords) => {
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

  // Use aggregation to get the distance calculated by MongoDB
  const result = await Zone.aggregate([
    {
      $geoNear: {
        near: {
          type: 'Point',
          coordinates: [userCoords.longitude, userCoords.latitude],
        },
        distanceField: 'distance',
        spherical: true,
        key: 'boundaries',
      },
    },
    {
      $match: {
        type: 'airport-parking',
        isActive: true,
      },
    },
    {
      $sort: {
        distance: 1,
      },
    },
    {
      $limit: 1,
    },
  ]);

  if (result.length === 0) {
    return null;
  }

  const nearestZone = result[0];

  // Calculate the accurate center point of the polygon boundaries
  const centerPoint = calculatePolygonCentroid(
    nearestZone.boundaries.coordinates,
  );

  const nearest = {
    zoneId: nearestZone._id,
    zoneName: nearestZone.name,
    zoneType: nearestZone.type,
    coordinates: {
      latitude: centerPoint.latitude,
      longitude: centerPoint.longitude,
    },
    distanceKm: Number((nearestZone.distance / 1000).toFixed(3)),
    boundaries: nearestZone.boundaries,
    metadata: nearestZone.metadata || {},
    description: nearestZone.description,
    minSearchRadius: nearestZone.minSearchRadius || 5,
    maxSearchRadius: nearestZone.maxSearchRadius || 10,
    isActive: nearestZone.isActive,
    // Add the actual center calculation method used
    centerCalculation: 'centroid',
  };

  return {
    ...nearest,
    googleMapsUrl: `https://www.google.com/maps/dir/?api=1&origin=${userCoords.latitude},${userCoords.longitude}&destination=${centerPoint.latitude},${centerPoint.longitude}&travelmode=driving`,
    appleMapsUrl: `http://maps.apple.com/?saddr=${userCoords.latitude},${userCoords.longitude}&daddr=${centerPoint.latitude},${centerPoint.longitude}`,
  };
};

export const findDriverParkingQueue = async (parkingLotId) => {
  const queue = await ParkingQueue.findOne({
    parkingLotId,
    isActive: true,
  });

  if (!queue) {
    throw new Error('Airport parking queue not found');
  } else {
    return queue;
  }
};

export const addDriverToQueue = async (parkingLotId, driverId) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // First check if parking queue exists and has capacity
    const parkingQueue = await ParkingQueue.findOne({
      parkingLotId,
      isActive: true,
    }).session(session);

    if (!parkingQueue) {
      throw new Error(
        `Parking lot with ID ${parkingLotId} not found or inactive.`,
      );
    }

    // Check capacity
    if (parkingQueue.driverQueue.length >= parkingQueue.maxQueueSize) {
      throw new Error(
        `Parking queue is at maximum capacity (${parkingQueue.maxQueueSize}).`,
      );
    }

    // Check if driver is already in queue
    if (
      parkingQueue.driverQueue.find((driver) =>
        driver.driverId.equals(driverId),
      )
    ) {
      await session.commitTransaction();
      return {
        message: `Driver already in parking lot queue ${parkingLotId}.`,
        driverQueue: parkingQueue.driverQueue,
        queueSize: parkingQueue.driverQueue.length,
      };
    }

    // Atomically add driverId to the queue
    const updated = await ParkingQueue.findOneAndUpdate(
      {
        parkingLotId,
        isActive: true,
        'driverQueue.driverId': { $ne: driverId },
      },
      {
        $addToSet: {
          driverQueue: {
            driverId: driverId,
          },
        },
      },
      { new: true, session },
    );
    if (!updated) {
      throw new Error(
        `Failed to add driver to queue - possible race condition.`,
      );
    }

    await session.commitTransaction();
    return {
      message: `Driver successfully added to parking lot queue ${parkingLotId}.`,
      driverQueue: updated.driverQueue,
      queueSize: updated.driverQueue.length,
      position: updated.driverQueue.indexOf(driverId) + 1, // Driver's position in queue
    };
  } catch (err) {
    await session.abortTransaction();
    throw new Error(`Failed to add driver to queue: ${err.message}`);
  } finally {
    session.endSession();
  }
};

// export const removeDriverFromQueue = async (
//   driverId,
//   parkingQueueId,
//   session = null,
// ) => {
//   const useSession = session || (await mongoose.startSession());
//   if (!session) useSession.startTransaction();

//   try {
//     // Remove driver
//     const result = await ParkingQueue.findByIdAndUpdate(
//       parkingQueueId,
//       {
//         $pull: {
//           driverQueue: { driverId: driverId },
//         },
//       },
//       { new: true, session: useSession },
//     );

//     // Optional: Update positions for remaining drivers in affected queues
//     for (const queue of queuesWithDriver) {
//       await updateQueuePositions(queue.parkingLotId, useSession);
//     }

//     const drivers = result.driverQueue;
//     for (const driver of drivers) {
//       emitToUser(driver.driverId?.userId, 'ride:parking_queue', {});
//     }

//     if (!session) await useSession.commitTransaction();

//     return {
//       message: `Driver ${driverId} removed from ${result.modifiedCount} parking queue(s)`,
//       modifiedCount: result.modifiedCount,
//       matchedCount: result.matchedCount,
//       affectedQueues: queuesWithDriver.map((q) => q.parkingLotId),
//     };
//   } catch (err) {
//     if (!session) await useSession.abortTransaction();
//     throw new Error(`Failed to remove driver from queues: ${err.message}`);
//   } finally {
//     if (!session) useSession.endSession();
//   }
// };

export const removeDriverFromQueue = async (
  driverId,
  parkingQueueId,
  session = null,
) => {
  const useSession = session || (await mongoose.startSession());
  if (!session) useSession.startTransaction();

  try {
    // First get the current queue state before removal
    const currentQueue = await ParkingQueue.findById(parkingQueueId)
      .populate({
        path: 'driverQueue.driverId',
        populate: {
          path: 'userId',
          model: 'User',
          select: 'name email phoneNumber profileImg',
        },
      })
      .populate('parkingLotId', 'name boundaries')
      .populate('airportId', 'name')
      .session(useSession);

    if (!currentQueue) {
      throw new Error('Parking Queue not found');
    }

    // Remove driver from the queue
    const updatedQueue = await ParkingQueue.findByIdAndUpdate(
      parkingQueueId,
      {
        $pull: {
          driverQueue: { driverId: driverId },
        },
      },
      { new: true, session: useSession },
    )
      .populate({
        path: 'driverQueue.driverId',
        populate: {
          path: 'userId',
          model: 'User',
          select: 'name email phoneNumber profileImg',
        },
      })
      .populate('parkingLotId', 'name boundaries')
      .populate('airportId', 'name');

    if (!updatedQueue) {
      throw new Error('Failed to remove driver from queue');
    }

    // Emit updated queue data to all remaining drivers
    const waitingDrivers = updatedQueue.driverQueue
      .filter((driver) => driver.status === 'waiting')
      .sort((a, b) => a.joinedAt - b.joinedAt);

    // Send updated queue data to each remaining driver
    for (const driver of waitingDrivers) {
      if (driver.driverId && driver.driverId.userId) {
        const positionInWaiting = waitingDrivers.findIndex(
          (d) => d.driverId._id.toString() === driver.driverId._id.toString(),
        );

        const currentPosition =
          positionInWaiting >= 0 ? positionInWaiting + 1 : null;

        // Get drivers relative to current driver
        const driversAhead = waitingDrivers.slice(0, positionInWaiting);
        const driversBehind = waitingDrivers.slice(positionInWaiting + 1);

        const queueData = {
          success: true,
          data: {
            // ← Remove objectType and move data to top level
            queueInfo: {
              queueId: updatedQueue._id,
              parkingLot: updatedQueue.parkingLotId, // ← Changed from parkingLotId to parkingLot for consistency
              airport: updatedQueue.airportId, // ← Changed from airportId to airport for consistency
              totalDrivers: updatedQueue.driverQueue.length,
              totalWaitingDrivers: waitingDrivers.length,
              maxQueueSize: updatedQueue.maxQueueSize,
              isActive: updatedQueue.isActive,
              createdAt: updatedQueue.createdAt,
            },
            currentDriver: {
              driverId: driver.driverId._id,
              position: currentPosition,
              status: driver.status,
              joinedAt: driver.joinedAt,
              currentOfferId: driver.currentOfferId,
              timeInQueue: Date.now() - new Date(driver.joinedAt).getTime(),
              userInfo: driver.driverId.userId
                ? {
                    userId: driver.driverId.userId._id,
                    name: driver.driverId.userId.name,
                    email: driver.driverId.userId.email,
                    phoneNumber: driver.driverId.userId.phoneNumber,
                    profileImg: driver.driverId.userId.profileImg,
                  }
                : null,
            },
            allDrivers: waitingDrivers.map((queueDriver, index) => {
              const isCurrentDriver =
                queueDriver.driverId._id.toString() ===
                driver.driverId._id.toString();
              return {
                position: index + 1,
                driverId: queueDriver.driverId._id,
                status: queueDriver.status,
                joinedAt: queueDriver.joinedAt,
                currentOfferId: queueDriver.currentOfferId,
                timeInQueue:
                  Date.now() - new Date(queueDriver.joinedAt).getTime(),
                isCurrentDriver: isCurrentDriver,
                userInfo: queueDriver.driverId.userId
                  ? {
                      userId: queueDriver.driverId.userId._id,
                      name: queueDriver.driverId.userId.name,
                      email: queueDriver.driverId.userId.email,
                      phoneNumber: queueDriver.driverId.userId.phoneNumber,
                      profileImg: queueDriver.driverId.userId.profileImg,
                    }
                  : null,
              };
            }),
            queueBreakdown: {
              waiting: updatedQueue.driverQueue.filter(
                (d) => d.status === 'waiting',
              ).length,
              offered: updatedQueue.driverQueue.filter(
                (d) => d.status === 'offered',
              ).length,
              responding: updatedQueue.driverQueue.filter(
                (d) => d.status === 'responding',
              ).length,
              total: updatedQueue.driverQueue.length,
            },
            relativePosition: {
              // ← Add this missing section
              driversAhead: driversAhead.length,
              driversBehind: driversBehind.length,
              estimatedWaitTime: calculateEstimatedWaitTime(driversAhead),
              driversAheadList: driversAhead.map((aheadDriver, index) => ({
                position: index + 1,
                driverId: aheadDriver.driverId._id,
                joinedAt: aheadDriver.joinedAt,
                timeInQueue:
                  Date.now() - new Date(aheadDriver.joinedAt).getTime(),
                userInfo: aheadDriver.driverId.userId
                  ? {
                      name: aheadDriver.driverId.userId.name,
                      profileImg: aheadDriver.driverId.userId.profileImg,
                    }
                  : null,
              })),
            },
          },
        };

        // Emit to each remaining driver
        emitToUser(driver.driverId.userId._id, 'ride:parking_queue', queueData);
      }
    }

    // Optional: Update positions for remaining drivers
    await updateQueuePositions(updatedQueue.parkingLotId, useSession);

    if (!session) await useSession.commitTransaction();

    return {
      message: `Driver ${driverId} removed from parking queue`,
      removedDriverId: driverId,
      remainingDrivers: updatedQueue.driverQueue.length,
      notifiedDrivers: waitingDrivers.length,
      queueId: parkingQueueId,
    };
  } catch (err) {
    if (!session) await useSession.abortTransaction();
    throw new Error(`Failed to remove driver from queue: ${err.message}`);
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

export const findActiveRide = async (id, role) => {
  let query;
  if (role === 'driver')
    query = {
      driverId: id,
    };

  if (role === 'passenger')
    query = {
      passengerId: id,
    };

  const ride = RideModel.findOne({
    ...query,
    status: {
      $nin: [
        'RIDE_COMPLETED',
        'CANCELLED_BY_PASSENGER',
        'CANCELLED_BY_DRIVER',
        'CANCELLED_BY_SYSTEM',
      ],
    },
    paymentStatus: { $nin: ['PROCESSING', 'COMPLETED'] },
  })
    .populate([
      {
        path: 'driverId',
        populate: { path: 'userId' }, // populate driverId.userId
      },
      {
        path: 'passengerId',
        populate: { path: 'userId' }, // populate passengerId.userId
      },
      { path: 'chatRoomId' }, // simple top-level ref
    ])
    .lean();

  return ride;
};

export const deductRidenCommission = async (
  carType,
  actualFare,
  discount,
  rideId,
) => {
  const ride = await Ride.findById(rideId);
  if (!ride) {
    return false;
  }
  let driverDistanceCommission = 0;
  if (ride.driverDistance > 5) {
    driverDistanceCommission = 5 - Math.ceil(ride.driverDistance);
  }
  const commission = await Commission.findOne({ carType }).lean();

  await AdminCommission.create({
    date: new Date(),
    rideId,
    carType,
    totalAmount: actualFare,
    discount,
    commission: commission.percentage,
    commissionAmount:
      Math.floor((actualFare / 100) * commission.percentage) -
      driverDistanceCommission,
    driverDistanceCommission,
  });

  return Math.floor((actualFare / 100) * commission.percentage);
};

export const updateDriverRideHistory = async (driverId, rideId) =>
  DriverModel.findByIdAndUpdate(
    driverId,
    { $push: { rideIds: rideId } },
    { new: true },
  );
export const createRideTransaction = async (payload) =>
  RideTransaction.create(payload);

export const getPayoutWeek = (date = new Date()) => {
  const weekStart = moment(date).startOf('isoWeek');
  return weekStart.format('DD-MM-YYYY');
};

const updateQueuePositions = async (parkingLotId, session = null) => {
  try {
    const parkingQueue = await ParkingQueue.findOne({ parkingLotId }).session(
      session || null,
    );

    if (!parkingQueue) return;

    // Update positions based on joinedAt timestamp
    const sortedDrivers = parkingQueue.driverQueue
      .sort((a, b) => a.joinedAt - b.joinedAt)
      .map((driver, index) => ({
        ...driver.toObject(),
        position: index + 1,
      }));

    console.log(
      `🔄 Updated positions for ${sortedDrivers.length} drivers in queue ${parkingLotId}`,
    );
  } catch (error) {
    console.error('Error updating queue positions:', error);
  }
};

// const getNextDriverFromQueue = async (parkingQueueId) => {
//   try {
//     const parkingQueue = await ParkingQueue.findById(parkingQueueId).populate(
//       'driverQueue.driverId',
//     );

//     if (!parkingQueue) return null;

//     const waitingDrivers = parkingQueue.driverQueue
//       .filter((driver) => driver.status === 'waiting')
//       .sort((a, b) => a.joinedAt - b.joinedAt);

//     return waitingDrivers.length > 0 ? waitingDrivers[0] : null;
//   } catch (error) {
//     console.error('Error getting next driver from queue:', error);
//     return null;
//   }
// };

// const moveDriverToEndOfQueue = async (parkingQueueId, driverId, session) => {
//   // Get current driver data
//   const parkingQueue =
//     await ParkingQueue.findById(parkingQueueId).session(session);
//   const driverData = parkingQueue.driverQueue.find(
//     (d) => d.driverId.toString() === driverId.toString(),
//   );

//   if (!driverData) return;

//   // Remove driver from current position
//   await ParkingQueue.findByIdAndUpdate(
//     parkingQueueId,
//     {
//       $pull: { driverQueue: { driverId: driverId } },
//     },
//     { session },
//   );

//   // Add driver to end with updated joinedAt
//   await ParkingQueue.findByIdAndUpdate(
//     parkingQueueId,
//     {
//       $push: {
//         driverQueue: {
//           driverId: driverId,
//           joinedAt: new Date(), // This puts them at the end when sorted by joinedAt
//           status: 'waiting',
//           currentOfferId: null,
//         },
//       },
//     },
//     { session },
//   );
// };

export const findParkingQueue = async (driverId, queueId) => {
  try {
    // Populate with multiple levels
    const parkingQueue = await ParkingQueue.findById(queueId)
      .populate({
        path: 'driverQueue.driverId',
        populate: {
          path: 'userId',
          model: 'User',
          select: 'name email phoneNumber profileImg', // Select specific fields from User
        },
      })
      .populate('parkingLotId', 'name boundaries') // Populate parking lot info
      .populate('airportId', 'name') // Populate airport info
      .sort({ 'driverQueue.joinedAt': 1 });

    if (!parkingQueue) {
      throw new Error('Parking Queue not found');
    }

    const queue = parkingQueue.driverQueue;

    // Find the specific driver in queue
    const currentDriverInQueue = queue.find(
      (d) => d.driverId && d.driverId._id.toString() === driverId.toString(),
    );
    if (!currentDriverInQueue) {
      throw new Error('Driver not found in this parking queue');
    }

    // Get all waiting drivers sorted by join time
    const waitingDrivers = queue
      .filter((driver) => driver.status === 'waiting')
      .sort((a, b) => a.joinedAt - b.joinedAt);

    // Calculate position (only among waiting drivers)
    const positionInWaiting = waitingDrivers.findIndex(
      (d) => d.driverId._id.toString() === driverId.toString(),
    );

    const currentPosition =
      positionInWaiting >= 0 ? positionInWaiting + 1 : null;

    // Get drivers ahead in queue
    const driversAhead = waitingDrivers.slice(0, positionInWaiting);
    const driversBehind = waitingDrivers.slice(positionInWaiting + 1);

    // Format all drivers in queue with their positions
    const allDriversInQueue = waitingDrivers.map((driver, index) => {
      const isCurrentDriver =
        driver.driverId._id.toString() === driverId.toString();
      return {
        position: index + 1,
        driverId: driver.driverId._id,
        status: driver.status,
        joinedAt: driver.joinedAt,
        currentOfferId: driver.currentOfferId,
        timeInQueue: Date.now() - new Date(driver.joinedAt).getTime(),
        isCurrentDriver: isCurrentDriver,
        userInfo: driver.driverId.userId
          ? {
              userId: driver.driverId.userId._id,
              name: driver.driverId.userId.name,
              email: driver.driverId.userId.email,
              phoneNumber: driver.driverId.userId.phoneNumber,
              profileImg: driver.driverId.userId.profileImg,
            }
          : null,
      };
    });

    return {
      success: true,
      objectType: 'parking-queue',
      data: {
        queueInfo: {
          queueId: parkingQueue._id,
          parkingLot: parkingQueue.parkingLotId,
          airport: parkingQueue.airportId,
          totalDrivers: queue.length,
          totalWaitingDrivers: waitingDrivers.length,
          maxQueueSize: parkingQueue.maxQueueSize,
          isActive: parkingQueue.isActive,
          createdAt: parkingQueue.createdAt,
        },
        currentDriver: {
          driverId: currentDriverInQueue.driverId._id,
          position: currentPosition,
          status: currentDriverInQueue.status,
          joinedAt: currentDriverInQueue.joinedAt,
          currentOfferId: currentDriverInQueue.currentOfferId,
          timeInQueue:
            Date.now() - new Date(currentDriverInQueue.joinedAt).getTime(),
          userInfo: currentDriverInQueue.driverId.userId
            ? {
                userId: currentDriverInQueue.driverId.userId._id,
                name: currentDriverInQueue.driverId.userId.name,
                email: currentDriverInQueue.driverId.userId.email,
                phoneNumber: currentDriverInQueue.driverId.userId.phoneNumber,
                profileImg: currentDriverInQueue.driverId.userId.profileImg,
              }
            : null,
        },
        allDrivers: allDriversInQueue,
        queueBreakdown: {
          waiting: queue.filter((d) => d.status === 'waiting').length,
          offered: queue.filter((d) => d.status === 'offered').length,
          responding: queue.filter((d) => d.status === 'responding').length,
          total: queue.length,
        },
        relativePosition: {
          driversAhead: driversAhead.length,
          driversBehind: driversBehind.length,
          estimatedWaitTime: calculateEstimatedWaitTime(driversAhead),
          driversAheadList: driversAhead.map((driver, index) => ({
            position: index + 1,
            driverId: driver.driverId._id,
            joinedAt: driver.joinedAt,
            timeInQueue: Date.now() - new Date(driver.joinedAt).getTime(),
            userInfo: driver.driverId.userId
              ? {
                  name: driver.driverId.userId.name,
                  profileImg: driver.driverId.userId.profileImg,
                }
              : null,
          })),
        },
      },
      message: 'Parking queue retrieved successfully', // ← Add message
    };
  } catch (error) {
    console.error('Error finding parking queue:', error);
    throw error;
  }
};

const calculateEstimatedWaitTime = (driversAhead) => {
  if (driversAhead.length === 0) return 0;

  // Simple estimation: average 30 seconds per driver ahead
  const averageTimePerDriver = 10 * 1000; // 30 seconds in milliseconds
  return driversAhead.length * averageTimePerDriver;
};
