import mongoose from 'mongoose';
import { uploadAdminImage } from '../../utils/s3Uploader.js';
import { CAR_TYPES } from '../../enums/vehicleEnums.js';
import AdminModel from '../../models/Admin.js';
import Booking from '../../models/Ride.js';
import Feedback from '../../models/Feedback.js';
import Driver from '../../models/Driver.js';
import DriverLocation from '../../models/DriverLocation.js';
import RefundTransaction from '../../models/RefundTransaction.js';
import Passenger from '../../models/Passenger.js';
import Report from '../../models/Report.js';
import CMS from '../../models/CMS.js';
import Commission from '../../models/Commission.js';
import AdminCommission from '../../models/AdminCommission.js';
import Alert from '../../models/Alert.js';
import User from '../../models/User.js';

import { alertQueue } from '../../queues/alertQueue.js';
import firebaseAdmin from '../../config/firebaseAdmin.js';
import env from '../../config/envConfig.js';
import { notifyUser, createUserNotification } from '../notification.js';
import { getDriverLocation } from '../ride.js';
import { emitToUser } from '../../realtime/socket.js';

const BATCH_SIZE = Number(env.BATCH_SIZE || 500);
const messaging = firebaseAdmin.messaging();

const parseDateDMY = (dateStr, endOfDay = false) => {
  if (!dateStr) return null;
  
  // Handle both formats: DD-MM-YYYY and YYYY-MM-DD
  const parts = dateStr.split('-').map(Number);
  
  let day, month, year;
  
  // Check if it's YYYY-MM-DD format (first part is 4 digits or > 31)
  if (parts[0] > 31 || parts[0].toString().length === 4) {
    // YYYY-MM-DD format
    year = parts[0];
    month = parts[1];
    day = parts[2];
  } else {
    // DD-MM-YYYY format
    day = parts[0];
    month = parts[1];
    year = parts[2];
  }
  
  if (!day || !month || !year) return null;
  
  if (endOfDay) {
    return new Date(year, month - 1, day, 23, 59, 59, 999);
  }
  return new Date(year, month - 1, day, 0, 0, 0, 0);
};

const getAllDaysInMonth = (year, month) => {
  const days = [];
  const date = new Date(year, month, 1);
  while (date.getMonth() === month) {
    days.push(new Date(date));
    date.setDate(date.getDate() + 1);
  }
  return days;
};

export const findAdminByEmail = (email) => AdminModel.findOne({ email });

export const findAdminById = (id) => AdminModel.findById(id);

export const findAllAdmins = (page, limit) =>
  AdminModel.find({}, '-password -__v')
    .skip((page - 1) * limit)
    .limit(limit)
    .sort({ createdAt: -1 })
    .lean();

export const countAdmins = (filter = {}) => AdminModel.countDocuments(filter);

export const createAdmin = (adminData) => new AdminModel(adminData).save();

export const updateAdminById = (id, update) =>
  AdminModel.findByIdAndUpdate(id, update, { new: true }).lean();

export const searchAdmins = async (search, page = 1, limit = 10) => {
  if (!search || typeof search !== 'string' || !search.trim()) {
    throw new Error('Search term is required and must be a non-empty string.');
  }

  // Ensure pagination numbers are valid
  page = Math.max(parseInt(page, 10) || 1, 1);
  limit = Math.max(parseInt(limit, 10) || 10, 1);

  // Escape regex special characters safely
  const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const pipeline = [
    {
      $match: {
        $or: [
          { name: { $regex: escapedSearch, $options: 'i' } },
          { email: { $regex: escapedSearch, $options: 'i' } },
          { phoneNumber: { $regex: escapedSearch, $options: 'i' } },
        ],
      },
    },
    { $sort: { createdAt: -1 } },
    {
      $facet: {
        metadata: [{ $count: 'total' }],
        data: [
          { $skip: (page - 1) * limit },
          { $limit: limit },
          {
            $project: {
              password: 0, // Exclude sensitive fields
              __v: 0,
            },
          },
        ],
      },
    },
  ];

  const result = await AdminModel.aggregate(pipeline);

  const total = result[0]?.metadata[0]?.total || 0;
  const data = result[0]?.data || [];

  return {
    data,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
};

export const deleteAdmin = (id) => AdminModel.findByIdAndDelete(id);

// --- helper for dd-mm-yyyy parsing ---
const parseDate = (dateStr, endOfDay = false) => {
  if (!dateStr) return null;
  const [day, month, year] = dateStr.split('-').map(Number);
  if (!day || !month || !year) return null;

  return endOfDay
    ? new Date(year, month - 1, day, 23, 59, 59, 999)
    : new Date(year, month - 1, day, 0, 0, 0, 0);
};

export const findFinishedBookings = async ({
  page = 1,
  limit = 10,
  search = '',
  fromDate,
  toDate,
}) => {
  const safePage = Number(page) > 0 ? Number(page) : 1;
  const safeLimit = Number(limit) > 0 ? Number(limit) : 10;

  const finishedStatuses = [
    'RIDE_COMPLETED',
    'CANCELLED_BY_PASSENGER',
    'CANCELLED_BY_DRIVER',
    'CANCELLED_BY_SYSTEM',
  ];

  // --- base match ---
  const match = { status: { $in: finishedStatuses } };

  // --- date filter ---
  if (fromDate || toDate) {
    match.createdAt = {};
    if (fromDate) match.createdAt.$gte = parseDate(fromDate);
    if (toDate) match.createdAt.$lte = parseDate(toDate, true);
  }

  // --- safe search ---
  const safeSearch = typeof search === 'string' ? search.trim() : '';
  const escapedSearch = safeSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = safeSearch ? new RegExp(escapedSearch, 'i') : null;

  // --- query ---
  const query = Booking.find(match)
    .populate({
      path: 'passengerId',
      populate: { path: 'userId', select: 'name email phoneNumber' },
    })
    .populate({
      path: 'driverId',
      populate: { path: 'userId', select: 'name email phoneNumber' },
    })
    .sort({ createdAt: -1 }) // newest first
    .lean();

  const allBookings = await query;

  // --- apply search in-memory (safe + flexible) ---
  const filtered = regex
    ? allBookings.filter((b) => {
        const passenger = b.passengerId?.userId || {};
        const driver = b.driverId?.userId || {};
        return (
          regex.test(passenger.name || '') ||
          regex.test(passenger.email || '') ||
          regex.test(passenger.phoneNumber || '') ||
          regex.test(driver.name || '') ||
          regex.test(driver.email || '') ||
          regex.test(driver.phoneNumber || '') ||
          regex.test(b.rideId || '')
        );
      })
    : allBookings;

  const total = filtered.length;
  const start = (safePage - 1) * safeLimit;
  const paged = filtered.slice(start, start + safeLimit);

  // --- map result ---
  const data = paged.map((b) => ({
    _id: b._id,
    rideId: b.rideId,
    status: b.status,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
    actualFare: b.actualFare,
    passenger: {
      name: b.passengerId?.userId?.name || '',
      email: b.passengerId?.userId?.email || '',
      phoneNumber: b.passengerId?.userId?.phoneNumber || '',
    },
    driver: {
      name: b.driverId?.userId?.name || '',
      email: b.driverId?.userId?.email || '',
      phoneNumber: b.driverId?.userId?.phoneNumber || '',
    },
  }));

  return {
    data,
    total,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.ceil(total / safeLimit) || 0,
  };
};

export const findOngoingBookings = async ({
  page = 1,
  limit = 10,
  search = '',
  fromDate,
  toDate,
}) => {
  const safePage = Number(page) > 0 ? Number(page) : 1;
  const safeLimit = Number(limit) > 0 ? Number(limit) : 10;

  const ongoingStatuses = [
    'REQUESTED',
    'DRIVER_ASSIGNED',
    'DRIVER_ARRIVING',
    'DRIVER_ARRIVED',
    'RIDE_STARTED',
    'RIDE_IN_PROGRESS',
  ];

  // --- base match ---
  const match = { status: { $in: ongoingStatuses } };

  // --- date filter ---
  if (fromDate || toDate) {
    match.createdAt = {};
    if (fromDate) match.createdAt.$gte = parseDate(fromDate);
    if (toDate) match.createdAt.$lte = parseDate(toDate, true);
  }

  // --- safe search ---
  const safeSearch = typeof search === 'string' ? search.trim() : '';
  const escapedSearch = safeSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = safeSearch ? new RegExp(escapedSearch, 'i') : null;

  // --- query ---
  const query = Booking.find(match)
    .populate({
      path: 'passengerId',
      populate: { path: 'userId', select: 'name email phoneNumber' },
    })
    .populate({
      path: 'driverId',
      populate: { path: 'userId', select: 'name email phoneNumber' },
    })
    .sort({ createdAt: -1 }) // newest first
    .lean();

  const allBookings = await query;

  // --- apply search in-memory (safe + flexible) ---
  const filtered = regex
    ? allBookings.filter((b) => {
        const passenger = b.passengerId?.userId || {};
        const driver = b.driverId?.userId || {};
        const driverUniqueId = b.driverId?.uniqueId || '';
        return (
          regex.test(passenger.name || '') ||
          regex.test(passenger.email || '') ||
          regex.test(passenger.phoneNumber || '') ||
          regex.test(driver.name || '') ||
          regex.test(driver.email || '') ||
          regex.test(driver.phoneNumber || '') ||
          regex.test(driverUniqueId || '') ||
          regex.test(b.rideId || '')
        );
      })
    : allBookings;

  const total = filtered.length;
  const start = (safePage - 1) * safeLimit;
  const paged = filtered.slice(start, start + safeLimit);

  // --- map result ---
  const data = paged.map((b) => ({
    _id: b._id,
    rideId: b.rideId,
    status: b.status,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
    estimatedFare: b.estimatedFare,
    passenger: {
      uniqueId: b.passengerId?.uniqueId || '',
      name: b.passengerId?.userId?.name || '',
      email: b.passengerId?.userId?.email || '',
      phoneNumber: b.passengerId?.userId?.phoneNumber || '',
    },
    driver: {
      uniqueId: b.driverId?.uniqueId || '',
      name: b.driverId?.userId?.name || '',
      email: b.driverId?.userId?.email || '',
      phoneNumber: b.driverId?.userId?.phoneNumber || '',
    },
  }));

  return {
    data,
    total,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.ceil(total / safeLimit) || 0,
  };
};

export const findBookingById = async (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;

  const [booking] = await Booking.aggregate([
    { $match: { _id: new mongoose.Types.ObjectId(id) } },

    // 1️⃣ Join Passenger document
    {
      $lookup: {
        from: 'passengers',
        localField: 'passengerId',
        foreignField: '_id',
        as: 'passengerDoc',
      },
    },
    { $unwind: { path: '$passengerDoc', preserveNullAndEmptyArrays: true } },

    // 2️⃣ Join Passenger's User document
    {
      $lookup: {
        from: 'users',
        localField: 'passengerDoc.userId',
        foreignField: '_id',
        as: 'passengerUser',
      },
    },
    { $unwind: { path: '$passengerUser', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'passengers',
        localField: 'passengerDoc.userId',
        foreignField: 'userId',
        as: 'passengerData',
      },
    },
    { $unwind: { path: '$passengerData', preserveNullAndEmptyArrays: true } },

    // 3️⃣ Join Driver document (contains vehicle info)
    {
      $lookup: {
        from: 'drivers',
        localField: 'driverId',
        foreignField: '_id',
        as: 'driverDoc',
      },
    },
    { $unwind: { path: '$driverDoc', preserveNullAndEmptyArrays: true } },

    // 4️⃣ Join Driver's User document
    {
      $lookup: {
        from: 'users',
        localField: 'driverDoc.userId',
        foreignField: '_id',
        as: 'driverUser',
      },
    },
    { $unwind: { path: '$driverUser', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'drivers',
        localField: 'driverDoc.userId',
        foreignField: 'userId',
        as: 'driverData',
      },
    },
    { $unwind: { path: '$driverData', preserveNullAndEmptyArrays: true } },

    {
      $lookup: {
        from: 'feedbacks',
        localField: 'driverRating',
        foreignField: '_id',
        as: 'driverFeedback',
      },
    },
    { $unwind: { path: '$driverFeedback', preserveNullAndEmptyArrays: true } },

    {
      $lookup: {
        from: 'feedbacks',
        localField: 'passengerRating',
        foreignField: '_id',
        as: 'passengerFeedback',
      },
    },
    {
      $unwind: { path: '$passengerFeedback', preserveNullAndEmptyArrays: true },
    },

    // Lookup RefundTransaction to check if ride is refunded
    {
      $lookup: {
        from: 'refundtransactions',
        localField: '_id',
        foreignField: 'rideId',
        as: 'refundTransaction',
      },
    },
    { $unwind: { path: '$refundTransaction', preserveNullAndEmptyArrays: true } },

    // ✅ Final projection including vehicle details and refund info
    {
      $project: {
        _id: 1,
        rideId: 1,
        passengerId: 1,
        driverId: 1,
        status: 1,
        createdAt: 1,
        updatedAt: 1,
        pickupLocation: 1,
        dropoffLocation: 1,
        actualFare: 1,
        actualDistance: 1,
        estimatedFaree: 1,
        estimatedDistance: 1,
        paymentMethod: 1,
        paymentStatus: 1,
        fareBreakdown: '$fareBreakdown',
        tipBreakdown: '$tipBreakdown',
        passengerFeedback: '$passengerFeedback',
        driverFeedback: '$driverFeedback',
        passenger: {
          passengerUser: '$passengerUser',
          passengerData: '$passengerData',
        },
        driver: { driverUser: '$driverUser', driverData: '$driverData' },
        isRefunded: {
          $or: [
            { $eq: ['$paymentStatus', 'REFUNDED'] },
            { $ifNull: ['$refundTransaction', false] },
          ],
        },
        refundTransaction: {
          $cond: [
            { $ifNull: ['$refundTransaction', false] },
            {
              _id: '$refundTransaction._id',
              refundAmount: '$refundTransaction.refundAmount',
              refundReason: '$refundTransaction.refundReason',
              resolvedBy: '$refundTransaction.resolvedBy',
              createdAt: '$refundTransaction.createdAt',
            },
            null,
          ],
        },
      },
    },
  ]);

  booking || null;

  const passengerRides = await Booking.countDocuments({
    passengerId: booking.passengerId,
    status: 'RIDE_COMPLETED',
  });
  const passengerReviews = await Feedback.countDocuments({
    passengerId: booking.passengerId,
    type: 'by_driver',
  });

  let driverRides = 0;
  let driverReviews = 0;

  if (booking.driverId) {
    driverRides = await Booking.countDocuments({
      driverId: booking.driverId,
      status: 'RIDE_COMPLETED',
    });
    driverReviews = await Feedback.countDocuments({
      driverId: booking.driverId,
      type: 'by_passenger',
    });
  }

  return {
    ...booking,
    passengerRides,
    passengerReviews,
    driverRides,
    driverReviews,
  };
};

export const findScheduledBookings = async ({
  page = 1,
  limit = 10,
  search = '',
  fromDate,
  toDate,
  driverAssigned = false,
}) => {
  const safePage = Math.max(parseInt(page, 10) || 1, 1);
  const safeLimit = Math.max(parseInt(limit, 10) || 10, 1);

  // --- base match ---
  // Scheduled bookings are those with scheduledTime in the future and status REQUESTED
  const now = new Date();
  const match = {
    isScheduledRide: true,
    driverId: { $exists: driverAssigned },
    scheduledTime: { $gt: now },
  };

  // --- date filter on scheduledTime ---
  if (fromDate || toDate) {
    match.scheduledTime = { ...match.scheduledTime };
    if (fromDate) {
      match.scheduledTime.$gte = parseDate(fromDate);
    }
    if (toDate) {
      match.scheduledTime.$lte = parseDate(toDate, true);
    }
  }

  // --- safe search ---
  const safeSearch = typeof search === 'string' ? search.trim() : '';
  const escapedSearch = safeSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = safeSearch ? new RegExp(escapedSearch, 'i') : null;

  // --- query ---
  const query = Booking.find(match)
    .populate({
      path: 'passengerId',
      populate: { path: 'userId', select: 'name email phoneNumber profileImg' },
    })
    .sort({ scheduledTime: -1 }) // latest scheduled first
    .lean();

  const allBookings = await query;

  // --- apply search in-memory (safe + flexible) ---
  const filtered = regex
    ? allBookings.filter((b) => {
        const passenger = b.passengerId?.userId || {};
        const driver = b.driverId?.userId || {};
        return (
          regex.test(passenger.name || '') ||
          regex.test(passenger.email || '') ||
          regex.test(passenger.phoneNumber || '') ||
          regex.test(driver.name || '') ||
          regex.test(driver.email || '') ||
          regex.test(driver.phoneNumber || '') ||
          regex.test(b.rideId || '')
        );
      })
    : allBookings;

  const total = filtered.length;
  const start = (safePage - 1) * safeLimit;
  const paged = filtered.slice(start, start + safeLimit);

  // --- map result ---
  const data = paged.map((b) => {
    // Determine status based on ride state
    let displayStatus = b.status;
    
    // If ride is cancelled or completed, always show actual status
    const isCancelledOrCompleted = [
      'CANCELLED_BY_PASSENGER',
      'CANCELLED_BY_DRIVER',
      'CANCELLED_BY_SYSTEM',
      'RIDE_COMPLETED',
    ].includes(b.status);
    
    // Check if driver is assigned - driverId can be ObjectId, string, or null/undefined
    const hasDriver = b.driverId != null && b.driverId !== '';
    
    // Only override to PENDING if ride is active and no driver assigned
    if (!isCancelledOrCompleted && !hasDriver) {
      displayStatus = 'PENDING';
    }

    return {
      _id: b._id,
      rideId: b.rideId,
      status: b.status,
      scheduledTime: b.scheduledTime,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
      estimatedFare: b.estimatedFare,
      carType: b.carType,
      passenger: {
        uniqueId: b.passengerId?.uniqueId || '',
        name: b.passengerId?.userId?.name || '',
        email: b.passengerId?.userId?.email || '',
        phoneNumber: b.passengerId?.userId?.phoneNumber || '',
        profileImg: b.passengerId?.userId?.profileImg || '',
      },
      isDriverAssigned: b.driverId ? true : false,
    };
  });

  return {
    data,
    total,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.ceil(total / safeLimit) || 0,
  };
};

export const findNearestDriversForScheduledRide = async ({
  rideId,
  page = 1,
  limit = 10,
  search = '',
}) => {
  // 25km radius in meters
  const SEARCH_RADIUS = 25 * 1000;

  const safePage = Math.max(parseInt(page, 10) || 1, 1);
  const safeLimit = Math.max(parseInt(limit, 10) || 10, 1);

  // Validate rideId
  if (!rideId || !mongoose.Types.ObjectId.isValid(rideId)) {
    throw new Error('Valid rideId is required');
  }

  // Find the scheduled ride to get pickup location
  const ride = await Booking.findOne({
    _id: rideId,
  })
    .populate({
      path: 'passengerId',
      populate: { path: 'userId', select: 'name email phoneNumber' },
    })
    .lean();

  if (!ride) {
    throw new Error('Ride not found');
  }

  if (!ride.isScheduledRide || !ride.scheduledTime) {
    throw new Error('Ride is not a scheduled ride');
  }

  const pickupCoordinates = ride.pickupLocation?.coordinates;
  if (!pickupCoordinates || pickupCoordinates.length !== 2) {
    throw new Error('Invalid pickup location coordinates');
  }

  // --- safe search ---
  const safeSearch = typeof search === 'string' ? search.trim() : '';
  const escapedSearch = safeSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const searchRegex = safeSearch ? new RegExp(escapedSearch, 'i') : null;

  // Aggregation pipeline to find drivers within 25km radius
  const pipeline = [
    // Stage 1: Find nearby driver locations using $geoNear
    {
      $geoNear: {
        near: {
          type: 'Point',
          coordinates: pickupCoordinates, // [longitude, latitude]
        },
        distanceField: 'distance', // Distance in meters
        maxDistance: SEARCH_RADIUS, // 25km in meters
        spherical: true,
        key: 'location',
        query: {
          status: 'online',
          isAvailable: true,
          currentRideId: { $in: [null, undefined, ''] },
        },
      },
    },
    // Stage 2: Lookup driver details
    {
      $lookup: {
        from: 'drivers',
        localField: 'driverId',
        foreignField: '_id',
        as: 'driver',
      },
    },
    // Stage 3: Unwind driver array
    { $unwind: '$driver' },
    // Stage 4: Match driver criteria
    {
      $match: {
        'driver.vehicle.type': ride.carType,
        'driver.isBlocked': false,
        'driver.isSuspended': false,
        'driver.isActive': true,
        'driver.backgroundCheckStatus': 'approved',
        'driver.status': 'online',
      },
    },
    // Stage 5: Lookup user details
    {
      $lookup: {
        from: 'users',
        localField: 'driver.userId',
        foreignField: '_id',
        as: 'user',
      },
    },
    // Stage 6: Unwind user array
    { $unwind: '$user' },
    // Stage 7: Filter out blocked users
    {
      $match: {
        'user.isBlocked': { $ne: true },
      },
    },
    // Stage 8: Project fields
    {
      $project: {
        _id: 1,
        driverId: '$driver._id',
        userId: '$driver.userId',
        driverUniqueId: '$driver.uniqueId',
        location: 1,
        distance: 1, // Distance in meters from pickup location
        distanceKm: { $divide: ['$distance', 1000] }, // Distance in kilometers
        heading: 1,
        speed: 1,
        accuracy: 1,
        lastUpdated: 1,
        status: 1,
        isAvailable: 1,
        driverName: '$user.name',
        driverEmail: '$user.email',
        driverPhone: '$user.phoneNumber',
        driverProfileImg: '$user.profileImg',
        vehicleType: '$driver.vehicle.type',
        vehicleModel: '$driver.vehicle.model',
        vehiclePlate: '$driver.vehicle.plateNumber',
        vehicleColor: '$driver.vehicle.color',
        vehicleImage: '$driver.vehicle.imageUrl',
        rideId: ride._id,
        rideRideId: ride.rideId,
        pickupLocation: {
          address: ride.pickupLocation.address,
          placeName: ride.pickupLocation.placeName,
          coordinates: ride.pickupLocation.coordinates,
        },
        scheduledTime: ride.scheduledTime,
        carType: ride.carType,
      },
    },
    // Stage 9: Sort by distance (nearest first)
    { $sort: { distance: 1 } },
  ];

  // Execute aggregation
  const allDrivers = await DriverLocation.aggregate(pipeline);

  // Apply search filter in memory (search through driver name, email, phone, uniqueId, vehicle plate)
  const filtered = searchRegex
    ? allDrivers.filter((driver) => {
        return (
          searchRegex.test(driver.driverName || '') ||
          searchRegex.test(driver.driverEmail || '') ||
          searchRegex.test(driver.driverPhone || '') ||
          searchRegex.test(driver.driverUniqueId || '') ||
          searchRegex.test(driver.vehiclePlate || '')
        );
      })
    : allDrivers;

  // Calculate pagination
  const total = filtered.length;
  const start = (safePage - 1) * safeLimit;
  const paged = filtered.slice(start, start + safeLimit);

  // Map results for response
  const data = paged.map((driver) => ({
    _id: driver.driverId,
    uniqueId: driver.driverUniqueId,
    userId: driver.userId,
    name: driver.driverName,
    email: driver.driverEmail,
    phoneNumber: driver.driverPhone,
    profileImg: driver.driverProfileImg,
    distance: Math.round(driver.distance),
    status: driver.status,
    lastUpdated: driver.lastUpdated,
  }));

  return {
    data,
    total,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.ceil(total / safeLimit) || 0,
  };
};

export const assignDriverToScheduledRide = async ({ rideId, driverId }) => {
  // Validate rideId
  if (!rideId || !mongoose.Types.ObjectId.isValid(rideId)) {
    throw new Error('Invalid ride ID provided');
  } else if (!driverId || !mongoose.Types.ObjectId.isValid(driverId)) {
    throw new Error('Invalid driver ID provided');
  }

  // Find the ride
  const ride = await Booking.findById(rideId)
    .populate({
      path: 'passengerId',
      populate: { path: 'userId', select: 'name email phoneNumber' },
    })
    .lean();

  if (!ride) {
    throw new Error('Ride not found');
  } else if (!ride.isScheduledRide) {
    throw new Error('This ride is not a scheduled ride');
  } else if (!ride.scheduledTime) {
    throw new Error('Scheduled time is missing for this ride');
  } else if (ride.driverId) {
    throw new Error('Ride already has a driver assigned');
  } else if (ride.status !== 'SCHEDULED') {
    throw new Error(
      `Cannot assign driver to a ride with status: ${ride.status}. Ride must be SCHEDULED`,
    );
  }

  // Find the driver with userId populated
  const driver = await Driver.findById(driverId)
    .populate({
      path: 'userId',
      select: 'name email phoneNumber _id',
    })
    .lean();

  // Also fetch driver without lean to ensure we can get userId if populate fails
  const driverDoc = await Driver.findById(driverId).select('userId').lean();

  if (!driver) {
    throw new Error('Driver not found');
  } else if (driver.isBlocked) {
    throw new Error('Driver is blocked and cannot be assigned to rides');
  } else if (driver.isSuspended) {
    throw new Error('Driver is suspended and cannot be assigned to rides');
  } else if (!driver.isActive) {
    throw new Error('Driver is not active and cannot be assigned to rides');
  } else if (driver.backgroundCheckStatus !== 'approved') {
    throw new Error(
      `Driver background check status is ${driver.backgroundCheckStatus}. Only approved drivers can be assigned`,
    );
  } else if (!driver.vehicle || !driver.vehicle.type) {
    throw new Error('Driver vehicle information is missing');
  } else if (driver.vehicle.type !== ride.carType) {
    throw new Error(
      `Driver vehicle type (${driver.vehicle.type}) does not match ride car type (${ride.carType})`,
    );
  }

  // Ensure driver documents (including license) and waybill are valid at time of assignment
  const wayBillDocs = Object.values(driver.wayBill || {});
  if (
    wayBillDocs.length === 0 ||
    wayBillDocs.some((doc) => !doc.status || doc.status !== 'issued')
  ) {
    throw new Error('Driver waybill is not issued. Cannot assign this driver');
  }

  const documentList = Object.values(driver.documents || {});
  if (
    documentList.length === 0 ||
    documentList.some((doc) => !doc.status || doc.status !== 'verified')
  ) {
    throw new Error(
      'Driver documents are not fully verified. Cannot assign this driver',
    );
  }

  // Check driver location and availability
  const driverLocation = await DriverLocation.findOne({ driverId }).lean();

  if (!driverLocation) {
    throw new Error(
      'Driver location not found. Driver must be online to be assigned',
    );
  } else if (driverLocation.status !== 'online') {
    throw new Error(
      `Driver is currently ${driverLocation.status}. Only online drivers can be assigned`,
    );
  } else if (driverLocation.isAvailable === false) {
    throw new Error('Driver is not available for assignment');
  } else if (driverLocation.currentRideId) {
    throw new Error('Driver is currently on another ride');
  }

  // Update ride with driver assignment
  const updatedRide = await Booking.findByIdAndUpdate(
    rideId,
    {
      driverId: driverId,
      status: 'DRIVER_ASSIGNED',
      driverAssignedAt: new Date(),
    },
    { new: true },
  )
    .populate({
      path: 'passengerId',
      populate: { path: 'userId', select: 'name email phoneNumber' },
    })
    .populate({
      path: 'driverId',
      populate: { path: 'userId', select: 'name email phoneNumber profileImg' },
    })
    .lean();

  if (!updatedRide) {
    throw new Error('Failed to update ride with driver assignment');
  }

  // Format scheduled time for notification
  const scheduledTime = new Date(updatedRide.scheduledTime);
  const scheduledTimeFormatted = scheduledTime.toLocaleString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  // Get driver userId - extract from driver object (which is populated)
  // When using .lean() with .populate(), userId can be an object with _id or just an ObjectId
  let driverUserId = null;

  // First try: from populated driver object
  if (driver.userId) {
    // If userId is an object (populated), get _id
    if (typeof driver.userId === 'object' && driver.userId._id) {
      driverUserId = driver.userId._id.toString();
    }
    // If userId is already an ObjectId or string
    else if (driver.userId.toString) {
      driverUserId = driver.userId.toString();
    }
    // Fallback: try to use it directly
    else {
      driverUserId = driver.userId;
    }
  }

  // Second try: from driverDoc (non-populated, just the userId field)
  if (
    (!driverUserId || !mongoose.Types.ObjectId.isValid(driverUserId)) &&
    driverDoc?.userId
  ) {
    if (driverDoc.userId.toString) {
      driverUserId = driverDoc.userId.toString();
    } else {
      driverUserId = driverDoc.userId;
    }
  }

  // Third try: from updatedRide if not found in driver
  if (
    (!driverUserId || !mongoose.Types.ObjectId.isValid(driverUserId)) &&
    updatedRide.driverId?.userId
  ) {
    if (
      typeof updatedRide.driverId.userId === 'object' &&
      updatedRide.driverId.userId._id
    ) {
      driverUserId = updatedRide.driverId.userId._id.toString();
    } else if (updatedRide.driverId.userId.toString) {
      driverUserId = updatedRide.driverId.userId.toString();
    } else {
      driverUserId = updatedRide.driverId.userId;
    }
  }

  console.log('🔍 Driver notification debug:', {
    driverId: driverId.toString(),
    driverUserIdRaw: driver.userId,
    driverUserIdType: typeof driver.userId,
    driverUserIdIsObject: driver.userId && typeof driver.userId === 'object',
    driverUserIdId: driver.userId?._id,
    extractedDriverUserId: driverUserId,
    isValidObjectId:
      driverUserId && mongoose.Types.ObjectId.isValid(driverUserId),
  });

  if (!driverUserId || !mongoose.Types.ObjectId.isValid(driverUserId)) {
    console.error('❌ Failed to extract valid driver userId for notification', {
      driverId: driverId.toString(),
      driver: {
        _id: driver._id?.toString(),
        userId: driver.userId,
        userIdType: typeof driver.userId,
        userIdStringified: JSON.stringify(driver.userId),
      },
      updatedRideDriver: {
        driverId: updatedRide.driverId?._id?.toString(),
        userId: updatedRide.driverId?.userId,
      },
      extractedDriverUserId: driverUserId,
    });
    throw new Error('Failed to extract valid driver userId for notification');
  }

  const passengerName =
    updatedRide.bookedFor === 'SOMEONE'
      ? updatedRide.bookedForName
      : updatedRide.passengerId?.userId?.name || 'Passenger';

  // Extract passenger userId - similar to driver userId extraction
  let passengerUserId = null;
  if (updatedRide.passengerId?.userId) {
    // If userId is an object (populated), get _id
    if (
      typeof updatedRide.passengerId.userId === 'object' &&
      updatedRide.passengerId.userId._id
    ) {
      passengerUserId = updatedRide.passengerId.userId._id.toString();
    }
    // If userId is already an ObjectId or string
    else if (updatedRide.passengerId.userId.toString) {
      passengerUserId = updatedRide.passengerId.userId.toString();
    }
    // Fallback: try to use it directly
    else {
      passengerUserId = updatedRide.passengerId.userId;
    }
  }

  // Extract driver name
  const driverName =
    updatedRide.driverId?.userId?.name ||
    driver.userId?.name ||
    'Driver';

  try {
    // Send push notification to driver
    console.log('📤 Sending notification to driver:', {
      driverUserId,
      rideId: updatedRide._id.toString(),
      passengerName,
    });

    const driverNotificationResult = await notifyUser({
      userId: driverUserId,
      title: 'Scheduled Ride Assigned',
      message: `You have been assigned to a scheduled ride for ${passengerName}. Scheduled time: ${scheduledTimeFormatted}`,
      module: 'ride',
      metadata: updatedRide,
      type: 'ALERT',
      actionLink: 'scheduled_ride_assigned',
    });

    console.log('📬 Driver notification result:', {
      success: driverNotificationResult?.success,
      message: driverNotificationResult?.message,
      hasDbNotification: !!driverNotificationResult?.dbNotification,
      hasPushNotification: !!driverNotificationResult?.pushNotification,
    });

    if (!driverNotificationResult || !driverNotificationResult.success) {
      console.error('❌ Failed to send notification to driver', {
        driverUserId,
        rideId: updatedRide._id.toString(),
        result: driverNotificationResult,
      });
    } else {
      console.log('✅ Notification sent successfully to driver', {
        driverUserId,
        rideId: updatedRide._id.toString(),
        dbNotification: driverNotificationResult.dbNotification?._id,
        pushSent: !!driverNotificationResult.pushNotification,
      });
    }

    // Send real-time socket notification to driver
    try {
      emitToUser(driverUserId, 'ride:scheduled_ride_accepted', {
        success: true,
        objectType: 'scheduled-ride-accepted',
        data: {
          ride: updatedRide,
          scheduledTime: scheduledTimeFormatted,
          passengerName,
        },
        message: `You have been assigned to a scheduled ride for ${passengerName}`,
      });

      console.log('✅ Socket notification sent to driver', {
        driverUserId,
        rideId: updatedRide._id.toString(),
      });
    } catch (socketError) {
      console.error('❌ Error sending socket notification to driver', {
        driverUserId,
        rideId: updatedRide._id.toString(),
        error: socketError.message,
      });
    }

    // Send push notification to passenger
    if (passengerUserId && mongoose.Types.ObjectId.isValid(passengerUserId)) {
      console.log('📤 Sending notification to passenger:', {
        passengerUserId,
        rideId: updatedRide._id.toString(),
        driverName,
      });

      const passengerNotificationResult = await notifyUser({
        userId: passengerUserId,
        title: 'Driver Assigned to Your Scheduled Ride',
        message: `${driverName} has been assigned to your scheduled ride. Scheduled time: ${scheduledTimeFormatted}`,
        module: 'ride',
        metadata: updatedRide,
        type: 'ALERT',
        actionLink: 'scheduled_ride_driver_assigned',
      });

      console.log('📬 Passenger notification result:', {
        success: passengerNotificationResult?.success,
        message: passengerNotificationResult?.message,
        hasDbNotification: !!passengerNotificationResult?.dbNotification,
        hasPushNotification: !!passengerNotificationResult?.pushNotification,
      });

      if (!passengerNotificationResult || !passengerNotificationResult.success) {
        console.error('❌ Failed to send notification to passenger', {
          passengerUserId,
          rideId: updatedRide._id.toString(),
          result: passengerNotificationResult,
        });
      } else {
        console.log('✅ Notification sent successfully to passenger', {
          passengerUserId,
          rideId: updatedRide._id.toString(),
          dbNotification: passengerNotificationResult.dbNotification?._id,
          pushSent: !!passengerNotificationResult.pushNotification,
        });
      }

      // Send real-time socket notification to passenger
      try {
        emitToUser(passengerUserId, 'ride:scheduled_ride_accepted', {
          success: true,
          objectType: 'scheduled-ride-accepted',
          data: {
            ride: updatedRide,
            scheduledTime: scheduledTimeFormatted,
            driverName,
          },
          message: `${driverName} has been assigned to your scheduled ride`,
        });

        console.log('✅ Socket notification sent to passenger', {
          passengerUserId,
          rideId: updatedRide._id.toString(),
        });
      } catch (socketError) {
        console.error('❌ Error sending socket notification to passenger', {
          passengerUserId,
          rideId: updatedRide._id.toString(),
          error: socketError.message,
        });
      }
    } else {
      console.error('❌ Cannot send notification to passenger - invalid userId', {
        passengerUserId,
        rideId: updatedRide._id.toString(),
      });
    }
  } catch (notificationError) {
    console.error('❌ Error sending notifications', {
      driverUserId,
      passengerUserId,
      rideId: updatedRide._id.toString(),
      error: notificationError.message,
      stack: notificationError.stack,
    });
    // Don't throw error, just log it - ride assignment should still succeed
  }

  return updatedRide;
};

export const updateScheduledRideStatus = async (rideId, data) => {
  const ride = await Booking.findOne({
    _id: rideId,
    isScheduledRide: true,
    driverId: { $exists: false },
  }).populate('passengerId');

  if (!ride) {
    throw new Error('Ride not found');
  } else if (!ride.passengerId?.userId) {
    throw new Error('Passenger not found');
  } else if (ride.status !== 'SCHEDULED') {
    throw new Error(
      `Cannot update status of a ride with status: ${ride.status}. Ride must be SCHEDULED`,
    );
  } else if (ride.driverId) {
    throw new Error('Ride already has a driver assigned');
  }

  // Update ride fields
  ride.status = data.status;
  ride.paymentStatus = data.paymentStatus;
  ride.cancelledBy = data.cancelledBy;
  ride.cancellationReason = data.cancellationReason;
  ride.cancelledAt = data.cancelledAt;
  await ride.save();

  const notify = await notifyUser({
    userId: ride.passengerId?.userId,
    title: 'Scheduled Ride Rejected',
    message: 'Your ride scheduling request has been rejected by riden',
    module: 'ride',
    metadata: ride,
    type: 'ALERT',
  });
  if (!notify) {
    console.error('Failed to send notification');
  }

  return ride;
};

export const findDriverFeedbacks = async ({
  page = 1,
  limit = 10,
  search = '',
  fromDate,
  toDate,
  type = 'by_passenger',
}) => {
  const safePage = Math.max(parseInt(page, 10) || 1, 1);
  const safeLimit = Math.max(parseInt(limit, 10) || 10, 1);
  const skip = (safePage - 1) * safeLimit;

  // --- Search filter ---
  const safeSearch = (search || '').trim();
  const escapedSearch = safeSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const searchMatch =
    safeSearch.length > 0
      ? {
          $or: [
            { 'driver.uniqueId': { $regex: escapedSearch, $options: 'i' } },
            { 'driver.user.name': { $regex: escapedSearch, $options: 'i' } },
          ],
        }
      : {};

  // --- Date filter ---
  const dateFilter = {};
  const startDate = parseDateDMY(fromDate);
  const endDate = parseDateDMY(toDate, true);

  if (startDate) dateFilter.$gte = startDate;
  if (endDate) dateFilter.$lte = endDate;

  // --- Build match filter ---
  const matchFilter = {
    type,
    isApproved: true,
    ...(Object.keys(dateFilter).length ? { createdAt: dateFilter } : {}),
    ...(Object.keys(searchMatch).length ? searchMatch : {}),
  };

  // --- Aggregation pipeline ---
  const [result] = await Feedback.aggregate([
    // Lookup driver
    {
      $lookup: {
        from: 'drivers',
        localField: 'driverId',
        foreignField: '_id',
        as: 'driver',
      },
    },
    { $unwind: '$driver' },

    // Lookup driver user
    {
      $lookup: {
        from: 'users',
        localField: 'driver.userId',
        foreignField: '_id',
        as: 'driver.user',
      },
    },
    { $unwind: '$driver.user' },

    // Lookup passenger
    {
      $lookup: {
        from: 'passengers',
        localField: 'passengerId',
        foreignField: '_id',
        as: 'passenger',
      },
    },
    { $unwind: '$passenger' },

    // Lookup passenger user
    {
      $lookup: {
        from: 'users',
        localField: 'passenger.userId',
        foreignField: '_id',
        as: 'passenger.user',
      },
    },
    { $unwind: '$passenger.user' },

    // Match filters
    { $match: matchFilter },

    // Sort newest first
    { $sort: { createdAt: -1 } },

    // Pagination & projection
    {
      $facet: {
        metadata: [{ $count: 'total' }],
        data: [
          { $skip: skip },
          { $limit: safeLimit },
          {
            $project: {
              _id: 1,
              rating: 1,
              feedback: 1,
              createdAt: 1,
              rideId: 1,
              type: 1,
              'driver._id': 1,
              'driver.uniqueId': 1,
              'driver.user._id': 1,
              'driver.user.name': 1,
              'driver.user.email': 1,
              'driver.user.profileImg': 1,
              'passenger._id': 1,
              'passenger.uniqueId': 1,
              'passenger.user._id': 1,
              'passenger.user.name': 1,
              'passenger.user.email': 1,
              'passenger.user.profileImg': 1,
            },
          },
        ],
      },
    },
  ]);

  const total = result?.metadata?.[0]?.total || 0;

  return {
    data: result?.data || [],
    total,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.ceil(total / safeLimit),
  };
};

export const deleteFeedbackById = async (id) => {
  const feedback = await Feedback.findById(id);
  if (!feedback) return false;

  const booking = await Booking.findById(feedback.rideId);
  if (!booking) return false;

  // Only compare if the fields are not null
  if (
    booking.driverRating &&
    booking.driverRating.toString() === feedback._id.toString()
  ) {
    booking.driverRating = null;
  }

  if (
    booking.passengerRating &&
    booking.passengerRating.toString() === feedback._id.toString()
  ) {
    booking.passengerRating = null;
  }

  await booking.save();
  await Feedback.findByIdAndDelete(id);

  return true;
};

export const getFeedbackStats = async (type = 'by_passenger') => {
  if (!['by_driver', 'by_passenger'].includes(type)) {
    throw new Error('Invalid feedback type');
  }

  const now = new Date();
  const currentYear = now.getFullYear();
  const lastYear = currentYear - 1;

  const stats = await Feedback.aggregate([
    { $match: { type } },

    // 1️⃣ Group all feedbacks for overall stats
    {
      $group: {
        _id: null,
        totalFeedbacks: { $sum: 1 },
        averageRating: { $avg: '$rating' },
        oneStar: { $sum: { $cond: [{ $eq: ['$rating', 1] }, 1, 0] } },
        twoStar: { $sum: { $cond: [{ $eq: ['$rating', 2] }, 1, 0] } },
        threeStar: { $sum: { $cond: [{ $eq: ['$rating', 3] }, 1, 0] } },
        fourStar: { $sum: { $cond: [{ $eq: ['$rating', 4] }, 1, 0] } },
        fiveStar: { $sum: { $cond: [{ $eq: ['$rating', 5] }, 1, 0] } },

        // Count per year for growth
        currentYearCount: {
          $sum: {
            $cond: [{ $eq: [{ $year: '$createdAt' }, currentYear] }, 1, 0],
          },
        },
        lastYearCount: {
          $sum: { $cond: [{ $eq: [{ $year: '$createdAt' }, lastYear] }, 1, 0] },
        },
      },
    },

    // 2️⃣ Compute growth percentage
    {
      $project: {
        _id: 0,
        totalFeedbacks: 1,
        averageRating: { $round: ['$averageRating', 2] },
        oneStar: 1,
        twoStar: 1,
        threeStar: 1,
        fourStar: 1,
        fiveStar: 1,
        currentYearGrowthRate: {
          $cond: [
            { $eq: ['$lastYearCount', 0] },
            null,
            {
              $round: [
                {
                  $multiply: [
                    {
                      $divide: [
                        { $subtract: ['$currentYearCount', '$lastYearCount'] },
                        '$lastYearCount',
                      ],
                    },
                    100,
                  ],
                },
                2,
              ],
            },
          ],
        },
      },
    },
  ]);

  return (
    stats[0] || {
      totalFeedbacks: 0,
      averageRating: 0,
      oneStar: 0,
      twoStar: 0,
      threeStar: 0,
      fourStar: 0,
      fiveStar: 0,
      currentYearGrowthRate: null,
    }
  );
};

export const findRequestedFeedbacks = async (
  page = 1,
  limit = 10,
  type = 'by_passenger',
) => {
  const safePage = Math.max(parseInt(page, 10) || 1, 1);
  const safeLimit = Math.max(parseInt(limit, 10) || 10, 1);
  const skip = (safePage - 1) * safeLimit;

  // Fetch feedbacks with isApproved: false
  const feedbacks = await Feedback.find({ isApproved: false, type })
    .populate({
      path: 'passengerId',
      select: 'uniqueId',
      populate: {
        path: 'userId',
        select: 'name email profileImg',
      },
    })
    .populate({
      path: 'driverId',
      select: 'uniqueId',
      populate: {
        path: 'userId',
        select: 'name email profileImg',
      },
    })
    .populate({
      path: 'rideId',
      select: 'rideId',
    })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(safeLimit)
    .lean();

  // Get total count
  const total = await Feedback.countDocuments({ isApproved: false, type });

  return {
    data: feedbacks,
    total,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.ceil(total / safeLimit),
  };
};

export const toggleFeedbackById = async (id, { status }) => {
  if (status === 'reject') {
    // First retrieve feedback to get rideId and type before deleting
    const feedback = await Feedback.findById(id).lean();
    if (!feedback) return false;

    // Delete the feedback
    const result = await Feedback.findByIdAndDelete(id);
    if (!result) return false;

    // Remove the rating reference from Ride model
    // If feedback type is 'by_passenger', remove driverRating
    // If feedback type is 'by_driver', remove passengerRating
    const updateField =
      feedback.type === 'by_passenger' ? 'driverRating' : 'passengerRating';

    // Set isRatingAllow to false when feedback is rejected
    // This prevents user from submitting rating again
    await Booking.findByIdAndUpdate(feedback.rideId, {
      $unset: { [updateField]: 1 },
      $set: { isRatingAllow: false },
    });

    return true;
  } else if (status === 'approve') {
    const result = await Feedback.findByIdAndUpdate(
      id,
      { isApproved: true },
      { new: true },
    ).lean();
    if (!result) return false;
    return true;
  } else {
    return false;
  }
};

export const findActiveDriversCount = async () =>
  Driver.countDocuments({
    status: { $in: ['online', 'on_ride'] },
    isBlocked: false,
    isSuspended: false,
    isDeleted: false,
    isApproved: true,
    // Exclude any driver with a rejected document
    'documents.proofOfWork.status': { $ne: 'rejected' },
    'documents.profilePicture.status': { $ne: 'rejected' },
    'documents.driversLicense.status': { $ne: 'rejected' },
    'documents.commercialDrivingRecord.status': { $ne: 'rejected' },
    'documents.vehicleOwnerCertificateAndInsurance.status': {
      $ne: 'rejected',
    },
    'documents.vehicleInspection.status': { $ne: 'rejected' },
  }).lean();

export const findDashboardData = async () => {
  const ongoingStatuses = [
    'DRIVER_ASSIGNED',
    'DRIVER_ARRIVING',
    'DRIVER_ARRIVED',
    'RIDE_STARTED',
    'RIDE_IN_PROGRESS',
  ];

  // Fetch ongoing rides
  const rides = await Booking.find({ status: { $in: ongoingStatuses } }).lean();

  // Total ongoing rides count (more efficient than rides.length in case you filter later)
  const totalOngoingRides = rides.length;

  // Get driverIds from rides
  const driverIds = rides.map((r) => r.driverId);

  // Fetch driver locations using getDriverLocation function (from Redis)
  const locationPromises = driverIds.map((driverId) =>
    getDriverLocation(driverId),
  );
  const locationResults = await Promise.all(locationPromises);

  // Create a map of driverId to location for efficient lookup
  const locationMap = new Map();
  driverIds.forEach((driverId, index) => {
    const location = locationResults[index];
    if (location && location.coordinates) {
      locationMap.set(driverId.toString(), location);
    }
  });

  // Merge ride with driver location
  const rideData = rides.map((ride) => {
    const loc = locationMap.get(ride.driverId?.toString());
    return {
      rideId: ride._id,
      status: ride.status,
      driverId: ride.driverId,
      location: loc
        ? { lng: loc.coordinates[0], lat: loc.coordinates[1] }
        : null,
    };
  });

  return {
    totalOngoingRides,
    rides: rideData,
  };
};

export const findOngoingRideInfo = async (rideId) => {
  const rides = await Booking.aggregate([
    { $match: { _id: new mongoose.Types.ObjectId(rideId) } },

    // Lookup driver
    {
      $lookup: {
        from: 'drivers',
        localField: 'driverId',
        foreignField: '_id',
        as: 'driver',
      },
    },
    { $unwind: { path: '$driver', preserveNullAndEmptyArrays: true } },

    // Lookup driver->user (profile info)
    {
      $lookup: {
        from: 'users',
        localField: 'driver.userId',
        foreignField: '_id',
        as: 'driverUser',
      },
    },
    { $unwind: { path: '$driverUser', preserveNullAndEmptyArrays: true } },

    // Total rides of driver (only completed/cancelled, excluding current)
    {
      $lookup: {
        from: 'rides',
        let: { dId: '$driver._id', currentRideId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$driverId', '$$dId'] },
                  { $ne: ['$_id', '$$currentRideId'] },
                  {
                    $in: [
                      '$status',
                      [
                        'RIDE_COMPLETED',
                        'CANCELLED_BY_PASSENGER',
                        'CANCELLED_BY_DRIVER',
                        'CANCELLED_BY_SYSTEM',
                      ],
                    ],
                  },
                ],
              },
            },
          },
          { $count: 'totalRides' },
        ],
        as: 'driverRides',
      },
    },
    {
      $addFields: {
        totalRides: {
          $ifNull: [{ $arrayElemAt: ['$driverRides.totalRides', 0] }, 0],
        },
      },
    },

    // Total feedbacks of driver (only from passengers)
    {
      $lookup: {
        from: 'feedbacks',
        let: { dId: '$driver._id' },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ['$driverId', '$$dId'] },
              type: 'by_passenger',
            },
          },
          { $count: 'totalFeedbacks' },
        ],
        as: 'driverFeedbacks',
      },
    },
    {
      $addFields: {
        totalFeedbacks: {
          $ifNull: [
            { $arrayElemAt: ['$driverFeedbacks.totalFeedbacks', 0] },
            0,
          ],
        },
      },
    },

    // Final projection
    {
      $project: {
        _id: 1,
        rideId: 1,
        pickupLocation: 1,
        dropoffLocation: 1,
        estimatedFare: 1,
        estimatedDistance: 1,
        estimatedDuration: 1,

        driver: {
          vehicle: 1,
        },
        driverUser: {
          name: 1,
          profileImg: 1,
        },
        totalRides: 1,
        totalFeedbacks: 1,
      },
    },
  ]);

  return rides[0] || null;
};

export const findGenericAnalytics = async (
  filter = 'this_month',
  startDate = null,
  endDate = null,
) => {
  const excludeStatuses = [
    'REQUESTED',
    'DRIVER_ASSIGNED',
    'DRIVER_ARRIVING',
    'DRIVER_ARRIVED',
    'RIDE_STARTED',
    'RIDE_IN_PROGRESS',
  ];

  // --- Handle date filters ---
  let dateFilter = {};
  
  // Priority: If startDate and endDate are provided, use them (ignore filter)
  // Otherwise, use filter to determine date range
  if (startDate && endDate) {
    // ✅ Custom range - supports both DD-MM-YYYY and YYYY-MM-DD formats
    const start = parseDateDMY(startDate);
    const end = parseDateDMY(endDate, true);
    
    if (!start || !end) {
      console.error('[findGenericAnalytics] Invalid date format:', { startDate, endDate });
      return {
        totalRides: 0,
        totalDrivers: 0,
        totalRevenue: 0,
        satisfactionRate: 0,
      };
    }
    
    dateFilter = {
      createdAt: {
        $gte: start,
        $lte: end,
      },
    };
  } else if (filter) {
    const now = new Date();
    let start;

    switch (filter) {
      case 'today':
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        dateFilter = { createdAt: { $gte: start, $lte: now } };
        break;

      case 'this_week': {
        const firstDayOfWeek = new Date(now);
        firstDayOfWeek.setDate(now.getDate() - now.getDay());
        firstDayOfWeek.setHours(0, 0, 0, 0);
        dateFilter = { createdAt: { $gte: firstDayOfWeek, $lte: now } };
        break;
      }

      case 'this_month':
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        dateFilter = { createdAt: { $gte: start, $lte: now } };
        break;

      case 'last_year':
        start = new Date(now.getFullYear() - 1, 0, 1);
        const end = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
        dateFilter = { createdAt: { $gte: start, $lte: end } };
        break;

      default:
        dateFilter = {};
    }
  }

  // --- Total rides & total actual fare ---
  // Use requestedAt for date filter (same as stats endpoint)
  const rideDateFilter = dateFilter.createdAt
    ? { requestedAt: dateFilter.createdAt }
    : {};

  const rideStats = await Booking.aggregate([
    {
      $match: {
        status: { $nin: excludeStatuses },
        ...rideDateFilter,
      },
    },
    {
      $group: {
        _id: null,
        totalRides: { $sum: 1 },
        totalActualFare: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $ne: ['$actualFare', null] },
                  { $gt: ['$actualFare', 0] },
                  { $eq: ['$status', 'RIDE_COMPLETED'] }, // Count revenue from completed rides
                ],
              },
              '$actualFare',
              0,
            ],
          },
        },
      },
    },
  ]);

  // --- Total drivers (active drivers who completed rides today) ---
  const driverDateFilter = rideDateFilter.requestedAt
    ? { requestedAt: rideDateFilter.requestedAt, status: 'RIDE_COMPLETED' }
    : { status: 'RIDE_COMPLETED' };
  
  const activeDriversResult = await Booking.aggregate([
    {
      $match: driverDateFilter,
    },
    {
      $group: {
        _id: '$driverId',
      },
    },
    {
      $count: 'totalDrivers',
    },
  ]);
  const totalDrivers = activeDriversResult[0]?.totalDrivers || 0;

  // --- Passenger feedback stats (feedbacks for today's rides) ---
  // First get today's completed ride IDs
  const todayRideIds = await Booking.find({
    ...rideDateFilter,
    status: 'RIDE_COMPLETED',
  })
    .select('_id')
    .lean();
  
  const rideIds = todayRideIds.map((ride) => ride._id);

  // Only query feedbacks if there are rides today
  const feedbackMatch = rideIds.length > 0
    ? {
        type: 'by_passenger',
        rideId: { $in: rideIds }, // Feedbacks for today's rides
      }
    : {
        type: 'by_passenger',
        rideId: { $in: [] }, // Empty array - no matches
      };

  const feedbackStats = await Feedback.aggregate([
    {
      $match: feedbackMatch,
    },
    {
      $group: {
        _id: null,
        totalFeedbacks: { $sum: 1 },
        fiveStarCount: {
          $sum: { $cond: [{ $eq: ['$rating', 5] }, 1, 0] },
        },
      },
    },
    {
      $project: {
        _id: 0,
        percentageFiveStar: {
          $cond: [
            { $gt: ['$totalFeedbacks', 0] },
            {
              $multiply: [
                { $divide: ['$fiveStarCount', '$totalFeedbacks'] },
                100,
              ],
            },
            0,
          ],
        },
      },
    },
  ]);

  return {
    totalRides: rideStats[0]?.totalRides || 0,
    totalDrivers,
    totalRevenue: rideStats[0]?.totalActualFare || 0,
    satisfactionRate: feedbackStats[0]?.percentageFiveStar || 0,
  };
};

export const driversAnalytics = async (filter = 'today') => {
  // --- Totals ---
  const totalDrivers = await Driver.countDocuments();

  const totalActiveDrivers = await Driver.countDocuments({
    status: { $in: ['online', 'on_ride'] },
    isBlocked: false,
    isSuspended: false,
    isDeleted: false,
    isApproved: true,
  });

  const totalOfflineDrivers = await Driver.countDocuments({
    status: 'offline',
    isBlocked: false,
    isSuspended: false,
    isDeleted: false,
    isApproved: true,
  });

  const totalFeedbacks = await Feedback.countDocuments({
    type: 'by_passenger',
  });

  const totalReportedDrivers = await Report.countDocuments({
    type: 'by_passenger',
  });

  const totalRides = await Booking.countDocuments({
    isDeleted: { $ne: true },
  });

  // Count unique drivers who have been reported
  const uniqueReportedDrivers = await Report.distinct('driverId', {
    type: 'by_passenger',
    driverId: { $ne: null, $exists: true },
  });

  // Count unique drivers who have received feedback
  const uniqueReviewedDrivers = await Feedback.distinct('driverId', {
    type: 'by_passenger',
    driverId: { $ne: null, $exists: true },
  });

  const reportedDriversPercentage =
    totalDrivers > 0
      ? (uniqueReportedDrivers.length / totalDrivers) * 100
      : 0;

  const reviewedDriversPercentage =
    totalDrivers > 0
      ? (uniqueReviewedDrivers.length / totalDrivers) * 100
      : 0;

  // --- Date range ---
  const now = new Date();
  let startDate, endDate, groupFormat;

  switch (filter) {
    case 'today':
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      endDate = now;
      groupFormat = '%H';
      break;

    case 'this_week': {
      const firstDayOfWeek = new Date(now);
      firstDayOfWeek.setDate(now.getDate() - now.getDay());
      firstDayOfWeek.setHours(0, 0, 0, 0);
      startDate = firstDayOfWeek;
      endDate = now;
      groupFormat = '%Y-%m-%d';
      break;
    }

    case 'this_month':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      groupFormat = '%Y-%m-%d';
      break;

    case 'last_year':
      startDate = new Date(now.getFullYear() - 1, 0, 1);
      endDate = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
      groupFormat = '%Y-%m';
      break;

    default:
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      endDate = now;
      groupFormat = '%Y-%m-%d';
  }

  // --- Aggregation ---
  const rideHours = await Booking.aggregate([
    {
      $match: {
        driverAssignedAt: { $gte: startDate, $lte: endDate },
        rideCompletedAt: { $exists: true, $ne: null },
        isDeleted: { $ne: true },
      },
    },
    {
      $project: {
        key: {
          $dateToString: { format: groupFormat, date: '$driverAssignedAt' },
        },
        durationHours: {
          $divide: [
            { $subtract: ['$rideCompletedAt', '$driverAssignedAt'] },
            1000 * 60 * 60,
          ],
        },
      },
    },
    {
      $group: {
        _id: '$key',
        totalHours: { $sum: '$durationHours' },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  // --- Calculate last 30 days range ---
  const today = new Date();
  const last30DaysDate = new Date();
  last30DaysDate.setDate(today.getDate() - 29); // including today

  const complaintsAndRatings = await Promise.all([
    // --- Complaints aggregation ---
    Report.aggregate([
      {
        $match: {
          createdAt: { $gte: last30DaysDate, $lte: today },
          type: 'by_passenger',
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          complaints: { $sum: 1 }, // 👈 renamed field to "complaints"
        },
      },
      { $sort: { _id: 1 } },
    ]),

    // --- Reviews aggregation ---
    Feedback.aggregate([
      {
        $match: {
          createdAt: { $gte: last30DaysDate, $lte: today },
          type: 'by_passenger',
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          reviews: { $sum: 1 }, // 👈 renamed field to "reviews"
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ]);

  const complaintsData = complaintsAndRatings[0];
  const ratingsData = complaintsAndRatings[1];

  // Generate array of last 30 days
  const getLast30Days = () => {
    const days = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      days.push(new Date(d));
    }
    return days;
  };

  const last30Days = getLast30Days();

  // Final chart data
  const monthlyComplaintsAndRatingsChart = [];
  last30Days.forEach((date) => {
    const dayKey = date.toISOString().split('T')[0];
    const complaintsEntry = complaintsData.find((c) => c._id === dayKey);
    const ratingsEntry = ratingsData.find((r) => r._id === dayKey);

    monthlyComplaintsAndRatingsChart.push({
      day: dayKey,
      complaints: complaintsEntry?.complaints || 0,
      reviews: ratingsEntry?.reviews || 0,
    });
  });

  // --- Format helpers ---
  const formatHours = (hours) => Number(hours.toFixed(2)); // 2 decimals
  const formatPercentage = (percentage) => Number(percentage.toFixed(2)); // 2 decimals for percentages

  // --- Fill missing slots ---
  const chartData = [];
  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const monthsOfYear = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];

  if (filter === 'today') {
    for (let h = 0; h < 24; h++) {
      const hourStr = h.toString().padStart(2, '0');
      const found = rideHours.find((r) => r._id === hourStr);
      chartData.push({
        hour: `${hourStr}:00`,
        totalHours: found ? formatHours(found.totalHours) : 0,
      });
    }
  } else if (filter === 'this_week') {
    const curDate = new Date(startDate);
    for (let i = 0; i < 7; i++) {
      const dayKey = curDate.toISOString().split('T')[0];
      const found = rideHours.find((r) => r._id === dayKey);
      chartData.push({
        day: dayKey,
        dayName: daysOfWeek[curDate.getDay()],
        totalHours: found ? formatHours(found.totalHours) : 0,
      });
      curDate.setDate(curDate.getDate() + 1);
    }
  } else if (filter === 'this_month') {
    const allDays = getAllDaysInMonth(now.getFullYear(), now.getMonth());
    allDays.forEach((date) => {
      const dayKey = date.toISOString().split('T')[0];
      const found = rideHours.find((r) => r._id === dayKey);
      chartData.push({
        day: dayKey,
        dayName: daysOfWeek[date.getDay()],
        totalHours: found ? formatHours(found.totalHours) : 0,
      });
    });
  } else if (filter === 'last_year') {
    for (let m = 0; m < 12; m++) {
      const monthKey = `${startDate.getFullYear()}-${(m + 1)
        .toString()
        .padStart(2, '0')}`;
      const found = rideHours.find((r) => r._id === monthKey);
      chartData.push({
        month: monthKey,
        monthName: monthsOfYear[m],
        totalHours: found ? formatHours(found.totalHours) : 0,
      });
    }
  }

  return {
    totalActiveDrivers,
    totalOfflineDrivers,
    totalFeedbacks,
    totalReportedDrivers,
    reportedDriversPercentage: formatPercentage(reportedDriversPercentage),
    reviewedDriversPercentage: formatPercentage(reviewedDriversPercentage),
    rideHoursChart: chartData,
    monthlyComplaintsAndRatingsChart,
  };
};

export const passengersAnalytics = async (filter = 'today') => {
  try {
    // --- Totals ---
    const [
      totalPassengers,
      totalActivePassengers,
      totalFeedbacks,
      totalReportedDrivers,
    ] = await Promise.all([
      Passenger.countDocuments({ isBlocked: false }),
      Passenger.countDocuments({ isBlocked: false, isActive: true }),
      Feedback.countDocuments({ type: 'by_driver' }),
      Report.countDocuments({ type: 'by_driver' }),
    ]);

    const reportedPassengersPercentage =
      totalPassengers > 0 ? (totalReportedDrivers / totalPassengers) * 100 : 0;

    const reviewedPassengersPercentage =
      totalPassengers > 0 ? (totalFeedbacks / totalPassengers) * 100 : 0;

    // --- Date range ---
    const now = new Date();
    let startDate, endDate, groupFormat;

    switch (filter) {
      case 'today':
        startDate = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
          0,
          0,
          0,
        );
        endDate = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
          23,
          59,
          59,
          999,
        );
        groupFormat = '%H';
        break;

      case 'this_week': {
        const firstDayOfWeek = new Date(now);
        firstDayOfWeek.setDate(now.getDate() - now.getDay());
        firstDayOfWeek.setHours(0, 0, 0, 0);
        startDate = firstDayOfWeek;
        endDate = new Date(firstDayOfWeek);
        endDate.setDate(firstDayOfWeek.getDate() + 6);
        endDate.setHours(23, 59, 59, 999);
        groupFormat = '%Y-%m-%d';
        break;
      }

      case 'this_month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
        endDate = new Date(
          now.getFullYear(),
          now.getMonth() + 1,
          0,
          23,
          59,
          59,
          999,
        );
        groupFormat = '%Y-%m-%d';
        break;

      case 'last_year':
        startDate = new Date(now.getFullYear() - 1, 0, 1, 0, 0, 0);
        endDate = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
        groupFormat = '%Y-%m';
        break;

      default:
        startDate = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
          0,
          0,
          0,
        );
        endDate = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
          23,
          59,
          59,
          999,
        );
        groupFormat = '%Y-%m-%d';
    }

    // --- Aggregation for rides ---
    const rideCounts = await Booking.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
          isDeleted: { $ne: true },
        },
      },
      {
        $group: {
          _id: '$passengerId',
          rideCount: { $sum: 1 },
          firstBookingDate: { $min: '$createdAt' },
        },
      },
      {
        $project: {
          rideCount: 1,
          key: {
            $dateToString: { format: groupFormat, date: '$firstBookingDate' },
          },
        },
      },
      {
        $group: {
          _id: {
            key: '$key',
            type: { $cond: [{ $eq: ['$rideCount', 1] }, 'single', 'multiple'] },
          },
          count: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: '$_id.key',
          data: { $push: { type: '$_id.type', count: '$count' } },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // --- Calculate last 30 days range ---
    const today = new Date();
    const last30DaysDate = new Date();
    last30DaysDate.setDate(today.getDate() - 29); // including today

    const complaintsAndRatings = await Promise.all([
      // --- Complaints aggregation ---
      Report.aggregate([
        {
          $match: {
            createdAt: { $gte: last30DaysDate, $lte: today },
            type: 'by_driver',
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            complaints: { $sum: 1 }, // 👈 renamed field to "complaints"
          },
        },
        { $sort: { _id: 1 } },
      ]),

      // --- Reviews aggregation ---
      Feedback.aggregate([
        {
          $match: {
            createdAt: { $gte: last30DaysDate, $lte: today },
            type: 'by_driver',
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            reviews: { $sum: 1 }, // 👈 renamed field to "reviews"
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    const complaintsData = complaintsAndRatings[0];
    const ratingsData = complaintsAndRatings[1];

    // Generate array of last 30 days
    const getLast30Days = () => {
      const days = [];
      for (let i = 29; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        days.push(new Date(d));
      }
      return days;
    };

    const last30Days = getLast30Days();

    // Final chart data
    const monthlyComplaintsAndRatingsChart = [];
    last30Days.forEach((date) => {
      const dayKey = date.toISOString().split('T')[0];
      const complaintsEntry = complaintsData.find((c) => c._id === dayKey);
      const ratingsEntry = ratingsData.find((r) => r._id === dayKey);

      monthlyComplaintsAndRatingsChart.push({
        day: dayKey,
        complaints: complaintsEntry?.complaints || 0,
        reviews: ratingsEntry?.reviews || 0,
      });
    });

    // --- Chart data for rides ---
    const chartData = [];
    const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const monthsOfYear = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];

    const calcRatio = (single, multiple) => {
      const total = single + multiple;
      return total > 0 ? Number(((multiple / total) * 100).toFixed(2)) : 0;
    };

    if (filter === 'today') {
      for (let h = 0; h < 24; h++) {
        const hourStr = h.toString().padStart(2, '0');
        const entry = rideCounts.find((r) => r._id === hourStr);
        const single = entry?.data.find((d) => d.type === 'single')?.count || 0;
        const multiple =
          entry?.data.find((d) => d.type === 'multiple')?.count || 0;
        chartData.push({
          hour: `${hourStr}:00`,
          single,
          multiple,
          repeatedRideRatio: calcRatio(single, multiple),
        });
      }
    } else if (filter === 'this_week') {
      const curDate = new Date(startDate);
      for (let i = 0; i < 7; i++) {
        const dayKey = curDate.toISOString().split('T')[0];
        const entry = rideCounts.find((r) => r._id === dayKey);
        const single = entry?.data.find((d) => d.type === 'single')?.count || 0;
        const multiple =
          entry?.data.find((d) => d.type === 'multiple')?.count || 0;
        chartData.push({
          day: dayKey,
          dayName: daysOfWeek[curDate.getDay()],
          single,
          multiple,
          repeatedRideRatio: calcRatio(single, multiple),
        });
        curDate.setDate(curDate.getDate() + 1);
      }
    } else if (filter === 'this_month') {
      const allDays = getAllDaysInMonth(now.getFullYear(), now.getMonth());
      allDays.forEach((date) => {
        const dayKey = date.toISOString().split('T')[0];
        const entry = rideCounts.find((r) => r._id === dayKey);
        const single = entry?.data.find((d) => d.type === 'single')?.count || 0;
        const multiple =
          entry?.data.find((d) => d.type === 'multiple')?.count || 0;
        chartData.push({
          day: dayKey,
          dayName: daysOfWeek[date.getDay()],
          single,
          multiple,
          repeatedRideRatio: calcRatio(single, multiple),
        });
      });
    } else if (filter === 'last_year') {
      for (let m = 0; m < 12; m++) {
        const monthKey = `${startDate.getFullYear()}-${(m + 1).toString().padStart(2, '0')}`;
        const entry = rideCounts.find((r) => r._id === monthKey);
        const single = entry?.data.find((d) => d.type === 'single')?.count || 0;
        const multiple =
          entry?.data.find((d) => d.type === 'multiple')?.count || 0;
        chartData.push({
          month: monthKey,
          monthName: monthsOfYear[m],
          single,
          multiple,
          repeatedRideRatio: calcRatio(single, multiple),
        });
      }
    }

    return {
      totalPassengers,
      totalActivePassengers,
      totalFeedbacks,
      totalReportedDrivers,
      reportedPassengersPercentage: reportedPassengersPercentage.toFixed(2),
      reviewedPassengersPercentage: reviewedPassengersPercentage.toFixed(2),
      passengerRideChart: chartData,
      monthlyComplaintsAndRatingsChart, // 👈 new chart added here
    };
  } catch (error) {
    console.error('Error in passengersAnalytics:', error);
    throw error;
  }
};

export const ridesAnalytics = async (filter = 'today') => {
  try {
    // --- Totals ---
    const [
      totalOngoingRides,
      totalCompletedRides,
      totalCancelledRides,
      totalAirportRides,
    ] = await Promise.all([
      Booking.countDocuments({
        status: {
          $in: [
            'DRIVER_ASSIGNED',
            'DRIVER_ARRIVING',
            'DRIVER_ARRIVED',
            'RIDE_STARTED',
            'RIDE_IN_PROGRESS',
          ],
        },
      }),
      Booking.countDocuments({ status: 'RIDE_COMPLETED' }),
      Booking.countDocuments({
        status: {
          $in: [
            'CANCELLED_BY_PASSENGER',
            'CANCELLED_BY_DRIVER',
            'CANCELLED_BY_SYSTEM',
          ],
        },
      }),
      Booking.countDocuments({
        isAirport: true,
        status: 'RIDE_COMPLETED',
      }),
    ]);

    // --- Cancellation reasons ---
    const [cancelledByDriver, cancelledByPassenger] = await Promise.all([
      Booking.countDocuments({ status: 'CANCELLED_BY_DRIVER' }),
      Booking.countDocuments({ status: 'CANCELLED_BY_PASSENGER' }),
    ]);

    // --- Cancellation rates ---
    const driverCancellationRate =
      totalCancelledRides > 0
        ? Number(((cancelledByDriver / totalCancelledRides) * 100).toFixed(2))
        : 0;

    const passengerCancellationRate =
      totalCancelledRides > 0
        ? Number(
            ((cancelledByPassenger / totalCancelledRides) * 100).toFixed(2),
          )
        : 0;

    // --- Date range setup (for chart) ---
    const now = new Date();
    let startDate, endDate, groupFormat;

    switch (filter) {
      case 'today':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        endDate = now;
        groupFormat = '%H';
        break;

      case 'this_week': {
        const firstDayOfWeek = new Date(now);
        firstDayOfWeek.setDate(now.getDate() - now.getDay());
        firstDayOfWeek.setHours(0, 0, 0, 0);
        startDate = firstDayOfWeek;
        endDate = now;
        groupFormat = '%Y-%m-%d';
        break;
      }

      case 'this_month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(
          now.getFullYear(),
          now.getMonth() + 1,
          0,
          23,
          59,
          59,
        );
        groupFormat = '%Y-%m-%d';
        break;

      case 'last_year':
        startDate = new Date(now.getFullYear() - 1, 0, 1);
        endDate = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
        groupFormat = '%Y-%m';
        break;

      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        endDate = now;
        groupFormat = '%Y-%m-%d';
    }

    // --- Aggregation for chart ---
    const rideCounts = await Booking.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
          isDeleted: { $ne: true },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: groupFormat, date: '$createdAt' } },
          rides: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // --- Airport rides aggregation for chart ---
    const airportRideCounts = await Booking.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
          isAirport: true,
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: groupFormat, date: '$createdAt' } },
          airportRides: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // --- Fill missing slots for chart ---
    const chartData = [];
    const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const monthsOfYear = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];

    if (filter === 'today') {
      for (let h = 0; h < 24; h++) {
        const hourStr = h.toString().padStart(2, '0');
        const entry = rideCounts.find((r) => r._id === hourStr);
        const airportEntry = airportRideCounts.find((r) => r._id === hourStr);
        chartData.push({
          hour: `${hourStr}:00`,
          rides: entry?.rides || 0,
          airportRides: airportEntry?.airportRides || 0,
        });
      }
    } else if (filter === 'this_week') {
      const curDate = new Date(startDate);
      for (let i = 0; i < 7; i++) {
        const dayKey = curDate.toISOString().split('T')[0];
        const entry = rideCounts.find((r) => r._id === dayKey);
        const airportEntry = airportRideCounts.find((r) => r._id === dayKey);
        chartData.push({
          day: dayKey,
          dayName: daysOfWeek[curDate.getDay()],
          rides: entry?.rides || 0,
          airportRides: airportEntry?.airportRides || 0,
        });
        curDate.setDate(curDate.getDate() + 1);
      }
    } else if (filter === 'this_month') {
      const allDays = getAllDaysInMonth(now.getFullYear(), now.getMonth());
      allDays.forEach((date) => {
        const dayKey = date.toISOString().split('T')[0];
        const entry = rideCounts.find((r) => r._id === dayKey);
        const airportEntry = airportRideCounts.find((r) => r._id === dayKey);
        chartData.push({
          day: dayKey,
          dayName: daysOfWeek[date.getDay()],
          rides: entry?.rides || 0,
          airportRides: airportEntry?.airportRides || 0,
        });
      });
    } else if (filter === 'last_year') {
      for (let m = 0; m < 12; m++) {
        const monthKey = `${startDate.getFullYear()}-${(m + 1)
          .toString()
          .padStart(2, '0')}`;
        const entry = rideCounts.find((r) => r._id === monthKey);
        const airportEntry = airportRideCounts.find((r) => r._id === monthKey);
        chartData.push({
          month: monthKey,
          monthName: monthsOfYear[m],
          rides: entry?.rides || 0,
          airportRides: airportEntry?.airportRides || 0,
        });
      }
    }

    // --- Peak hour analysis (always last 7 days) ---
    const last7DaysStart = new Date();
    last7DaysStart.setDate(now.getDate() - 6);
    last7DaysStart.setHours(0, 0, 0, 0);

    const hourlyData = await Booking.aggregate([
      {
        $match: {
          createdAt: { $gte: last7DaysStart, $lte: now },
          isDeleted: { $ne: true },
        },
      },
      {
        $project: {
          hour: { $hour: '$createdAt' },
          dayOfWeek: { $dayOfWeek: '$createdAt' }, // 1=Sun, 7=Sat
        },
      },
      {
        $group: {
          _id: { hour: '$hour', dayOfWeek: '$dayOfWeek' },
          rides: { $sum: 1 },
        },
      },
    ]);

    // Organize into buckets: allDays, weekdays, weekends
    const buildPeakRange = (data) => {
      const hourlyTotals = Array(24).fill(0);
      data.forEach((item) => {
        hourlyTotals[item._id.hour] += item.rides;
      });

      let bestStart = 0;
      let maxRides = 0;
      for (let h = 0; h < 23; h++) {
        const sum = hourlyTotals[h] + hourlyTotals[h + 1];
        if (sum > maxRides) {
          maxRides = sum;
          bestStart = h;
        }
      }

      const formatHour = (h) =>
        `${String(h).padStart(2, '0')}:00 ${h < 12 ? 'AM' : 'PM'}`;

      return {
        range: `${formatHour(bestStart)} - ${formatHour(bestStart + 1)}`,
        rides: maxRides,
      };
    };

    const allDaysRange = buildPeakRange(hourlyData);

    const weekdaysData = hourlyData.filter(
      (d) => d._id.dayOfWeek >= 2 && d._id.dayOfWeek <= 6,
    );
    const weekendsData = hourlyData.filter(
      (d) => d._id.dayOfWeek === 1 || d._id.dayOfWeek === 7,
    );

    const weekdaysRange = buildPeakRange(weekdaysData);
    const weekendsRange = buildPeakRange(weekendsData);

    return {
      totalOngoingRides,
      totalCompletedRides,
      totalCancelledRides,
      totalAirportRides,
      driverCancellationRate,
      passengerCancellationRate,
      rideChart: chartData,
      peakHours: {
        allDays: allDaysRange,
        weekdays: weekdaysRange,
        weekends: weekendsRange,
      },
    };
  } catch (error) {
    console.error('Error in ridesAnalytics:', error);
    throw error;
  }
};

export const financialAnalytics = async (filter = 'today') => {
  try {
    const now = new Date();
    let startDate, endDate, groupFormat;

    switch (filter) {
      case 'today':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        endDate = now;
        groupFormat = '%H';
        break;

      case 'this_week': {
        const firstDayOfWeek = new Date(now);
        firstDayOfWeek.setDate(now.getDate() - now.getDay());
        firstDayOfWeek.setHours(0, 0, 0, 0);
        startDate = firstDayOfWeek;
        endDate = now;
        groupFormat = '%Y-%m-%d';
        break;
      }

      case 'this_month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(
          now.getFullYear(),
          now.getMonth() + 1,
          0,
          23,
          59,
          59,
        );
        groupFormat = '%Y-%m-%d';
        break;

      case 'last_year':
        startDate = new Date(now.getFullYear() - 1, 0, 1);
        endDate = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
        groupFormat = '%Y-%m';
        break;

      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        endDate = now;
        groupFormat = '%Y-%m-%d';
    }

    // --- Get Completed Rides Data ---
    const completedRidesResults = await Booking.aggregate([
      {
        $match: {
          paymentStatus: 'COMPLETED',
          isDeleted: { $ne: true },
        },
      },
      {
        $project: {
          actualFare: 1,
          isDestinationRide: 1,
          paymentMethod: 1,
          createdAt: 1,
          commission: {
            $cond: [
              { $eq: ['$isDestinationRide', true] },
              { $multiply: ['$actualFare', 0.45] },
              { $multiply: ['$actualFare', 0.25] },
            ],
          },
        },
      },
      {
        $facet: {
          overall: [
            {
              $group: {
                _id: null,
                totalRevenue: { $sum: '$actualFare' },
                totalCommission: { $sum: '$commission' },
                cardPayments: {
                  $sum: { $cond: [{ $eq: ['$paymentMethod', 'CARD'] }, 1, 0] },
                },
                walletPayments: {
                  $sum: {
                    $cond: [{ $eq: ['$paymentMethod', 'WALLET'] }, 1, 0],
                  },
                },
                totalPayments: { $sum: 1 },
              },
            },
          ],
          chart: [
            {
              $match: {
                createdAt: { $gte: startDate, $lte: endDate },
              },
            },
            {
              $group: {
                _id: {
                  $dateToString: { format: groupFormat, date: '$createdAt' },
                },
                revenue: { $sum: '$actualFare' },
              },
            },
            { $sort: { _id: 1 } },
          ],
        },
      },
    ]);

    // --- Get Refund Data ---
    const refundResults = await RefundTransaction.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: null,
          totalRefundedAmount: { $sum: '$refundAmount' },
          totalRefundedRides: { $sum: 1 },
          totalDriverDeducted: { $sum: '$driverDeducted' },
        },
      },
    ]);

    // Get refund data for chart (time-based grouping)
    const refundChartResults = await RefundTransaction.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: groupFormat, date: '$createdAt' },
          },
          refundedAmount: { $sum: '$refundAmount' },
          refundedRides: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    if (!completedRidesResults.length) {
      const refundData = refundResults[0] || {
        totalRefundedAmount: 0,
        totalRefundedRides: 0,
        totalDriverDeducted: 0,
      };

      return {
        totalRevenue: 0,
        totalCommission: 0,
        driverProfit: 0,
        commissionPercentage: 0,
        paymentMethodRatio: { CARD: 0, WALLET: 0 },
        chart: [],
        totalRefundedAmount: refundData.totalRefundedAmount,
        totalRefundedRides: refundData.totalRefundedRides,
        refundPercentage: 0,
        totalDriverDeducted: refundData.totalDriverDeducted,
      };
    }

    const overall = completedRidesResults[0].overall[0] || {};
    const {
      totalRevenue = 0,
      totalCommission = 0,
      cardPayments = 0,
      walletPayments = 0,
      totalPayments = 0,
    } = overall;

    const refundData = refundResults[0] || {
      totalRefundedAmount: 0,
      totalRefundedRides: 0,
      totalDriverDeducted: 0,
    };

    // Calculate net revenue (total revenue minus refunds)
    const netRevenue = totalRevenue - refundData.totalRefundedAmount;

    const driverProfit = netRevenue - totalCommission;
    const commissionPercentage =
      netRevenue > 0
        ? Number(((totalCommission / netRevenue) * 100).toFixed(2))
        : 0;

    // Calculate refund percentage
    const totalRides = totalPayments + refundData.totalRefundedRides;
    const refundPercentage =
      totalRides > 0
        ? Number(
            ((refundData.totalRefundedRides / totalRides) * 100).toFixed(2),
          )
        : 0;

    const paymentMethodRatio = {
      CARD:
        totalPayments > 0
          ? Number(((cardPayments / totalPayments) * 100).toFixed(2))
          : 0,
      WALLET:
        totalPayments > 0
          ? Number(((walletPayments / totalPayments) * 100).toFixed(2))
          : 0,
    };

    const chartAgg = completedRidesResults[0].chart;
    const chartData = [];
    const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const monthsOfYear = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];

    // Merge completed rides data with refund data for chart
    if (filter === 'today') {
      for (let h = 0; h < 24; h++) {
        const hourStr = h.toString().padStart(2, '0');
        const revenueEntry = chartAgg.find((r) => r._id === hourStr);
        const refundEntry = refundChartResults.find((r) => r._id === hourStr);

        chartData.push({
          hour: `${hourStr}:00`,
          revenue: revenueEntry?.revenue || 0,
          refundedAmount: refundEntry?.refundedAmount || 0,
        });
      }
    } else if (filter === 'this_week') {
      const curDate = new Date(startDate);
      for (let i = 0; i < 7; i++) {
        const dayKey = curDate.toISOString().split('T')[0];
        const revenueEntry = chartAgg.find((r) => r._id === dayKey);
        const refundEntry = refundChartResults.find((r) => r._id === dayKey);

        chartData.push({
          day: dayKey,
          dayName: daysOfWeek[curDate.getDay()],
          revenue: revenueEntry?.revenue || 0,
          refundedAmount: refundEntry?.refundedAmount || 0,
        });
        curDate.setDate(curDate.getDate() + 1);
      }
    } else if (filter === 'this_month') {
      const allDays = getAllDaysInMonth(now.getFullYear(), now.getMonth());
      allDays.forEach((date) => {
        const dayKey = date.toISOString().split('T')[0];
        const revenueEntry = chartAgg.find((r) => r._id === dayKey);
        const refundEntry = refundChartResults.find((r) => r._id === dayKey);

        chartData.push({
          day: dayKey,
          dayName: daysOfWeek[date.getDay()],
          revenue: revenueEntry?.revenue || 0,
          refundedAmount: refundEntry?.refundedAmount || 0,
        });
      });
    } else if (filter === 'last_year') {
      for (let m = 0; m < 12; m++) {
        const monthKey = `${startDate.getFullYear()}-${(m + 1)
          .toString()
          .padStart(2, '0')}`;
        const revenueEntry = chartAgg.find((r) => r._id === monthKey);
        const refundEntry = refundChartResults.find((r) => r._id === monthKey);

        chartData.push({
          month: monthKey,
          monthName: monthsOfYear[m],
          revenue: revenueEntry?.revenue || 0,
          refundedAmount: refundEntry?.refundedAmount || 0,
        });
      }
    }

    return {
      totalRevenue: netRevenue, // Net revenue (after refunds)
      totalCommission,
      driverProfit,
      commissionPercentage,
      paymentMethodRatio,
      chart: chartData,
      totalRefundedAmount: refundData.totalRefundedAmount,
      totalRefundedRides: refundData.totalRefundedRides,
      refundPercentage,
      totalDriverDeducted: refundData.totalDriverDeducted,
    };
  } catch (error) {
    console.error('Error in financialAnalytics:', error);
    throw error;
  }
};

export const prepareBlocks = async (files = [], userId) => {
  const images = [];

  if (files && files.length > 0) {
    for (const file of files) {
      if (file.buffer && file.mimetype) {
        const url = await uploadAdminImage(userId, file);
        images.push(url);
      }
    }
  }

  return images;
};

// --- Find all CMS pages ---
export const findPages = async () => CMS.find().select('page').lean();

// --- Create CMS page ---
export const createCMSPage = async (page, cmsData) => {
  return CMS.create({ page, ...cmsData });
};

// --- Find by ID ---
export const findCMSPageById = async (id) => CMS.findById(id).lean();

// --- Update CMS page ---
export const findCMSPageByIdAndUpdate = async (id, updateData) => {
  return CMS.findByIdAndUpdate(id, updateData, { new: true }).lean();
};

export const findCommissions = async () => {
  const commissions = await Commission.find({
    carType: { $in: CAR_TYPES },
  }).lean();

  const commissionMap = new Map(
    commissions.map((c) => [c.carType, c.percentage]),
  );

  const result = CAR_TYPES.map((type) => ({
    carType: type,
    percentage: commissionMap.get(type) || 0,
  }));

  return result;
};

export const addOrUpdateCommissions = async (commissions = []) => {
  if (!Array.isArray(commissions)) {
    throw new Error('Commissions must be an array');
  }

  const results = [];
  for (const { carType, percentage } of commissions) {
    // Validate input
    if (!CAR_TYPES.includes(carType)) {
      throw new Error(
        `Invalid carType: ${carType}. Allowed: ${CAR_TYPES.join(', ')}`,
      );
    }
    if (percentage < 0) {
      throw new Error(`Percentage for ${carType} must be 0 or higher`);
    }

    const commission = await Commission.findOneAndUpdate(
      { carType },
      { carType, percentage },
      { upsert: true, new: true },
    );

    results.push(commission);
  }

  return results;
};

export const findAdminCommissions = async ({
  page = 1,
  limit = 10,
  search = '',
  fromDate,
  toDate,
}) => {
  const safePage =
    Number.isInteger(Number(page)) && Number(page) > 0 ? Number(page) : 1;
  const safeLimit =
    Number.isInteger(Number(limit)) && Number(limit) > 0 ? Number(limit) : 10;
  const skip = (safePage - 1) * safeLimit;

  // --- Build filter ---
  const filter = {};

  // --- Search filter ---
  if (search && search.trim()) {
    const searchTerm = search.trim();
    const regex = new RegExp(searchTerm, 'i');
    
    // Try to find by rideId first (if search looks like a rideId or exact match)
    const ride = await Booking.findOne({
      $or: [
        { rideId: searchTerm },
        { rideId: regex },
      ],
    }).lean();
    
    if (ride) {
      // Found ride by rideId, filter by rideId reference
      filter.rideId = ride._id;
    } else {
      // No ride found, search by carType
      filter.carType = regex;
    }
  }

  // --- Date filter ---
  const start = parseDateDMY(fromDate);
  const end = parseDateDMY(toDate);

  if (start || end) {
    filter.createdAt = {};
    if (start) filter.createdAt.$gte = start;
    if (end) {
      // set to end of day
      end.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = end;
    }
  }

  // --- Query ---
  const commissions = await AdminCommission.find(filter)
    .populate('rideId', 'rideId')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(safeLimit)
    .lean();

  const total = await AdminCommission.countDocuments(filter);

  return {
    data: commissions,
    pagination: {
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit),
    },
  };
};

export const findComissionStats = async () => {
  // Total rides
  const totalRides = await Booking.countDocuments({});

  // Total commission
  const commissionAgg = await AdminCommission.aggregate([
    {
      $group: {
        _id: null,
        totalCommission: { $sum: '$commissionAmount' },
      },
    },
  ]);

  const totalCommission =
    commissionAgg.length > 0 ? commissionAgg[0].totalCommission : 0;

  return {
    totalRides,
    totalCommission,
  };
};

// Helper function to check for invalid tokens
const isInvalidTokenError = (error) => {
  const invalidTokenErrors = [
    'messaging/invalid-registration-token',
    'messaging/registration-token-not-registered',
    'messaging/invalid-argument',
  ];
  return (
    invalidTokenErrors.includes(error?.code) ||
    error?.message?.includes('invalid token') ||
    error?.message?.includes('not registered')
  );
};

// Stats helper
const _sumStats = (stats1, stats2) => ({
  totalTargets: stats1.totalTargets + stats2.totalTargets,
  sent: stats1.sent + stats2.sent,
  failed: stats1.failed + stats2.failed,
  invalidTokens: stats1.invalidTokens + stats2.invalidTokens,
});

// --- API Function ---
export const createAndQueueAlert = async (
  user,
  { audience, recipients, blocks },
  resp,
) => {
  try {
    const alert = await createAlert({ user, audience, recipients, blocks });
    if (!alert) {
      resp.error = true;
      resp.error_message = 'Failed to create alert';
      return resp;
    }

    await alertQueue.add(
      'send-alert',
      { alertId: alert._id.toString() },
      {
        attempts: Number(env.JOB_ATTEMPTS || 5),
        backoff: {
          type: 'exponential',
          delay: Number(env.JOB_BACKOFF_MS || 2000),
        },
        removeOnComplete: true,
      },
    );

    resp.data = alert;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'something went wrong';
    return resp;
  }
};

export const createAlert = async ({ user, audience, recipients, blocks }) =>
  Alert.create({
    createdBy: user._id,
    audience,
    recipients: recipients || [],
    blocks,
    status: 'PENDING',
  });

// --- Worker Function ---
export const sendAlert = async (alertId) => {
  // Check MongoDB connection
  if (mongoose.connection.readyState !== 1) {
    throw new Error('Database not connected');
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const alert = await Alert.findById(alertId).session(session);
    if (!alert) {
      throw new Error(`Alert ${alertId} not found`);
    }

    // Update status to IN_PROGRESS
    alert.status = 'IN_PROGRESS';
    await alert.save({ session });

    // Build user query based on audience
    // Separate query for push notifications (requires device token)
    let pushNotificationQuery = { userDeviceToken: { $exists: true, $ne: null, $ne: '' } };
    
    // Query for all users (for in-app notifications - doesn't require device token)
    let allUsersQuery = {};

    // If recipients are provided, use them (even if audience is not explicitly 'custom')
    if (alert.recipients && alert.recipients.length > 0) {
      pushNotificationQuery._id = { $in: alert.recipients };
      allUsersQuery._id = { $in: alert.recipients };
    } else if (alert.audience === 'custom') {
      pushNotificationQuery._id = { $in: alert.recipients || [] };
      allUsersQuery._id = { $in: alert.recipients || [] };
    } else if (alert.audience === 'drivers') {
      pushNotificationQuery.roles = { $in: ['driver'] };
      allUsersQuery.roles = { $in: ['driver'] };
    } else if (alert.audience === 'passengers') {
      pushNotificationQuery.roles = { $in: ['passenger'] };
      allUsersQuery.roles = { $in: ['passenger'] };
    } else if (alert.audience === 'all') {
      // For 'all' audience, get all users
      allUsersQuery = {};
    }

    // Get users for push notifications (requires device token)
    const usersForPush = await User.aggregate([
      { $match: pushNotificationQuery },
      { $project: { _id: 1, userDeviceToken: 1 } },
    ]);

    // Get ALL users for in-app notifications (doesn't require device token)
    const allUsers = await User.aggregate([
      { $match: allUsersQuery },
      { $project: { _id: 1, userDeviceToken: 1 } },
    ]);

    console.log(`📊 Alert ${alertId}: Found ${usersForPush.length} users with device tokens, ${allUsers.length} total users for notifications`);

    let stats = { totalTargets: 0, sent: 0, failed: 0, invalidTokens: 0 };
    const primaryBlock = (alert.blocks && alert.blocks[0]) || {
      title: '',
      body: '',
      data: {},
    };

    // Determine module based on audience for in-app notifications
    // Use 'ride' module as it's in ALLOWED_USER_SETTINGS and is appropriate for alerts
    let notificationModule = 'ride'; // Default module
    if (alert.audience === 'drivers') {
      notificationModule = 'ride'; // Drivers receive ride-related alerts
    } else if (alert.audience === 'passengers') {
      notificationModule = 'ride'; // Passengers receive ride-related alerts
    } else {
      notificationModule = 'ride'; // All users receive ride-related alerts
    }

    // Send push notifications in batches (only to users with device tokens)
    for (let i = 0; i < usersForPush.length; i += BATCH_SIZE) {
      const batch = usersForPush.slice(i, i + BATCH_SIZE);
      const validUsers = batch.filter((user) => user.userDeviceToken);

      if (validUsers.length > 0) {
        const batchResult = await _sendBatch(validUsers, primaryBlock);
        stats = _sumStats(stats, batchResult);
      }
    }

    // Create in-app notifications for ALL users (in batches)
    console.log(`📝 Starting in-app notification creation for ${allUsers.length} users`);
    let notificationCount = 0;
    let notificationErrors = 0;

    for (let i = 0; i < allUsers.length; i += BATCH_SIZE) {
      const batch = allUsers.slice(i, i + BATCH_SIZE);

      // Create in-app notifications for ALL users in batch (whether they have device tokens or not)
      for (const user of batch) {
        try {
          // Ensure title and message are not empty
          const notificationTitle = (primaryBlock.title && primaryBlock.title.trim()) || 'Alert';
          const notificationMessage = (primaryBlock.body && primaryBlock.body.trim()) || 'You have a new notification';
          
          // Skip if both title and message are empty (shouldn't happen but safety check)
          if (!notificationTitle || !notificationMessage) {
            console.warn(`Skipping notification creation for user ${user._id} - empty title/message`);
            continue;
          }

          const notificationResult = await createUserNotification({
            title: notificationTitle,
            message: notificationMessage,
            module: notificationModule,
            userId: user._id.toString(),
            metadata: {
              alertId: alertId.toString(),
              ...(primaryBlock.data || {}),
            },
            type: 'ALERT',
            actionLink: primaryBlock.data?.actionLink || null,
          });
          
          if (!notificationResult || !notificationResult.success) {
            notificationErrors++;
            console.error(`❌ Failed to create in-app notification for user ${user._id}:`, notificationResult?.message || 'Unknown error');
          } else {
            notificationCount++;
            if (notificationCount % 10 === 0) {
              console.log(`✅ Created ${notificationCount} in-app notifications so far...`);
            }
          }
        } catch (notifError) {
          notificationErrors++;
          // Log error but don't fail the alert sending process
          console.error(`❌ Exception creating in-app notification for user ${user._id}:`, notifError.message || notifError);
        }
      }

      // Small delay to prevent overwhelming database
      if (i + BATCH_SIZE < allUsers.length) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }

    console.log(`📊 Notification creation completed: ${notificationCount} created, ${notificationErrors} failed`);

    // Update alert with final stats
    alert.stats = {
      totalTargets: stats.totalTargets,
      sent: stats.sent,
      failed: stats.failed,
      invalidTokens: stats.invalidTokens,
    };

    alert.status =
      stats.failed === 0
        ? 'SENT'
        : stats.sent === 0
          ? 'FAILED'
          : 'PARTIALLY_SENT';

    await alert.save({ session });
    await session.commitTransaction();

    console.log(
      `Alert ${alertId} completed: ${stats.sent} sent, ${stats.failed} failed`,
    );
    return stats;
  } catch (error) {
    await session.abortTransaction();
    console.error(`Error processing alert ${alertId}:`, error);
    throw error;
  } finally {
    session.endSession();
  }
};

// --- Batch sender ---
const _sendBatch = async (users, block) => {
  const tokens = users.map((user) => user.userDeviceToken);
  const message = {
    notification: {
      title: block.title || 'Notification',
      body: block.body || '',
    },
    data: block.data || {},
    tokens,
    apns: {
      payload: {
        aps: {
          sound: 'default',
          badge: 1,
        },
      },
    },
    android: {
      priority: 'high',
    },
  };

  const result = {
    totalTargets: tokens.length,
    sent: 0,
    failed: 0,
    invalidTokens: 0,
  };

  try {
    const resp = await messaging.sendEachForMulticast(message);

    // Process invalid tokens
    const invalidTokenUpdates = [];

    for (let i = 0; i < resp.responses.length; i++) {
      const response = resp.responses[i];
      const user = users[i];

      if (response.success) {
        result.sent++;
      } else {
        result.failed++;

        if (isInvalidTokenError(response.error)) {
          result.invalidTokens++;
          invalidTokenUpdates.push(
            User.updateOne(
              { _id: user._id },
              { $unset: { userDeviceToken: 1 } },
            ),
          );
        }
      }
    }

    // Bulk update invalid tokens
    if (invalidTokenUpdates.length > 0) {
      await Promise.allSettled(invalidTokenUpdates);
    }
  } catch (error) {
    console.error('_sendBatch fatal error:', error);
    result.failed = tokens.length;
  }

  return result;
};

export const findAllPassengers = async () =>
  Passenger.find()
    .select('userId uniqueId')
    .populate({ path: 'userId', select: 'name email profileImg phoneNumber' })
    .lean();

export const findAllDrivers = async () =>
  Driver.find()
    .select('userId uniqueId')
    .populate({ path: 'userId', select: 'name email profileImg phoneNumber' })
    .lean();

export const deleteAlertById = async (alertId, adminId) => {
  if (!alertId || !adminId) {
    return {
      success: false,
      message: 'Alert ID and Admin ID are required.',
    };
  }

  // Check if alert exists and was created by this admin
  const alert = await Alert.findOne({
    _id: alertId,
    createdBy: adminId,
  });

  if (!alert) {
    return {
      success: false,
      message: 'Alert not found or you do not have permission to delete it.',
    };
  }

  // Delete the alert
  const result = await Alert.findByIdAndDelete(alertId);

  return {
    success: true,
    message: 'Alert deleted successfully',
    data: result,
  };
};

export const findAllAlerts = async ({
  page = 1,
  limit = 10,
  fromDate,
  toDate,
  search = '',
}) => {
  const safePage =
    Number.isInteger(Number(page)) && Number(page) > 0 ? Number(page) : 1;
  const safeLimit =
    Number.isInteger(Number(limit)) && Number(limit) > 0 ? Number(limit) : 10;
  const skip = (safePage - 1) * safeLimit;

  // --- Build filter ---
  const filter = {};

  // helper to convert "30-09-2025" → Date
  const parseDate = (dateStr, endOfDay = false) => {
    const [day, month, year] = dateStr.split('-').map(Number);
    return endOfDay
      ? new Date(year, month - 1, day, 23, 59, 59, 999)
      : new Date(year, month - 1, day, 0, 0, 0, 0);
  };

  // Date range filter
  if (fromDate || toDate) {
    filter.createdAt = {};
    if (fromDate) filter.createdAt.$gte = parseDate(fromDate); // start of day
    if (toDate) filter.createdAt.$lte = parseDate(toDate, true); // end of day
  }

  // Search filter (title in blocks, status, or createdAt as string)
  if (search) {
    const regex = new RegExp(search, 'i'); // case-insensitive
    filter.$or = [
      { 'blocks.title': regex },
      { 'blocks.body': regex },
      { status: regex },
      {
        $expr: {
          $regexMatch: {
            input: {
              $dateToString: { format: '%d-%m-%Y', date: '$createdAt' },
            },
            regex: search,
            options: 'i',
          },
        },
      },
    ];
  }

  const [alerts, total] = await Promise.all([
    Alert.find(filter)
      .sort({ createdAt: -1 }) // newest first
      .skip(skip)
      .limit(safeLimit)
      .lean(),
    Alert.countDocuments(filter),
  ]);

  // Add title field to each alert from blocks[0].title for dropdown display
  const alertsWithTitle = alerts.map((alert) => ({
    ...alert,
    title: alert.blocks && alert.blocks.length > 0 ? alert.blocks[0].title : '',
  }));

  return {
    data: alertsWithTitle,
    pagination: {
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit),
    },
  };
};
