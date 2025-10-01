import mongoose from 'mongoose';
import { uploadAdminImage } from '../../utils/s3Uploader.js';
import { CAR_TYPES } from '../../enums/carType.js';
import AdminModel from '../../models/Admin.js';
import Booking from '../../models/Ride.js';
import Feedback from '../../models/Feedback.js';
import Driver from '../../models/Driver.js';
import DriverLocation from '../../models/DriverLocation.js';
import Passenger from '../../models/Passenger.js';
import Report from '../../models/Report.js';
import CMS from '../../models/CMS.js';
import Commission from '../../models/Commission.js';
import AdminCommission from '../../models/AdminCommission.js';
import Alert from '../../models/Alert.js';
import User from '../../models/User.js';

import firebaseAdmin from '../../config/firebaseAdmin.js';
import env from '../../config/envConfig.js';

const parseDateDMY = (dateStr, endOfDay = false) => {
  if (!dateStr) return null;
  const [day, month, year] = dateStr.split('-').map(Number);
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

const BATCH_SIZE = Number(env.BATCH_SIZE || 500);
const messaging = firebaseAdmin.messaging();

const isInvalidTokenError = (err) => {
  if (!err) return false;
  const m = (err.message || '').toLowerCase();
  return /registration-token-not-registered|invalid-registration-token|not-registered|invalid argument|unauthorized/i.test(
    m,
  );
};

const _sumStats = (a, b) => ({
  totalTargets: a.totalTargets + b.totalTargets,
  sent: a.sent + b.sent,
  failed: a.failed + b.failed,
  invalidTokens: a.invalidTokens + b.invalidTokens,
});

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

  // Build initial date/status match
  const match = { status: { $in: finishedStatuses } };
  if (fromDate || toDate) {
    match.createdAt = {};
    if (fromDate) match.createdAt.$gte = new Date(fromDate);
    if (toDate) match.createdAt.$lte = new Date(`${toDate}T23:59:59.999Z`);
  }

  // Load everything with passenger/driver populated
  const allBookings = await Booking.find(match)
    .populate({
      path: 'passengerId',
      populate: { path: 'userId', select: 'name email phoneNumber' },
    })
    .populate({
      path: 'driverId',
      populate: { path: 'userId', select: 'name email phoneNumber' },
    })
    .lean();

  // Escape regex safely
  const safeSearch = typeof search === 'string' ? search.trim() : '';
  const escapedSearch = safeSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = safeSearch ? new RegExp(escapedSearch, 'i') : null;

  // Filter in JS for guaranteed accuracy
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
          regex.test(driver.phoneNumber || '')
        );
      })
    : allBookings;

  // Sort newest first
  filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const total = filtered.length;
  const start = (safePage - 1) * safeLimit;
  const paged = filtered.slice(start, start + safeLimit);

  // Map to desired shape
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

  // Build initial date/status match
  const match = { status: { $in: ongoingStatuses } };
  if (fromDate || toDate) {
    match.createdAt = {};
    if (fromDate) match.createdAt.$gte = new Date(fromDate);
    if (toDate) match.createdAt.$lte = new Date(`${toDate}T23:59:59.999Z`);
  }

  // Load everything with passenger/driver populated
  const allBookings = await Booking.find(match)
    .populate({
      path: 'passengerId',
      populate: { path: 'userId', select: 'name email phoneNumber' },
    })
    .populate({
      path: 'driverId',
      populate: { path: 'userId', select: 'name email phoneNumber' },
    })
    .lean();

  // Escape regex safely
  const safeSearch = typeof search === 'string' ? search.trim() : '';
  const escapedSearch = safeSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = safeSearch ? new RegExp(escapedSearch, 'i') : null;

  // Filter in JS for guaranteed accuracy
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
          regex.test(driver.phoneNumber || '')
        );
      })
    : allBookings;

  // Sort newest first
  filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const total = filtered.length;
  const start = (safePage - 1) * safeLimit;
  const paged = filtered.slice(start, start + safeLimit);

  // Map to desired shape
  const data = paged.map((b) => ({
    _id: b._id,
    rideId: b.rideId,
    status: b.status,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
    estimatedFare: b.estimatedFare,
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

    // ✅ Final projection including vehicle details
    {
      $project: {
        _id: 1,
        rideId: 1,
        status: 1,
        createdAt: 1,
        updatedAt: 1,
        actualFare: 1,
        pickupLocation: 1,
        dropoffLocation: 1,
        actualDistance: 1,
        paymentMethod: 1,
        tipBreakdown: {
          amount: '$tipBreakdown.amount',
        },
        passengerFeedback: {
          rating: '$passengerFeedback.rating',
          review: '$passengerFeedback.feedback',
        },
        driverFeedback: {
          rating: '$driverFeedback.rating',
          feedback: '$driverFeedback.feedback',
        },
        passenger: {
          _id: '$passengerUser._id',
          name: { $ifNull: ['$passengerUser.name', 'N/A'] },
          email: { $ifNull: ['$passengerUser.email', 'N/A'] },
          phoneNumber: { $ifNull: ['$passengerUser.phoneNumber', 'N/A'] },
          profileImg: { $ifNull: ['$passengerUser.profileImg', 'N/A'] },
        },

        driver: {
          _id: '$driverUser._id',
          name: { $ifNull: ['$driverUser.name', 'N/A'] },
          email: { $ifNull: ['$driverUser.email', 'N/A'] },
          phoneNumber: { $ifNull: ['$driverUser.phoneNumber', 'N/A'] },
          profileImg: { $ifNull: ['$driverUser.profileImg', 'N/A'] },
          // ✅ Vehicle details from Driver schema
          vehicle: {
            type: { $ifNull: ['$driverDoc.vehicle.type', 'N/A'] },
            model: { $ifNull: ['$driverDoc.vehicle.model', 'N/A'] },
            plateNumber: { $ifNull: ['$driverDoc.vehicle.plateNumber', 'N/A'] },
            color: { $ifNull: ['$driverDoc.vehicle.color', 'N/A'] },
            imageUrl: { $ifNull: ['$driverDoc.vehicle.imageUrl', 'N/A'] },
          },
        },
      },
    },
  ]);

  return booking || null;
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
  const startDate = parseDateDMYDMY(fromDate);
  const endDate = parseDateDMYDMY(toDate, true);

  if (startDate) dateFilter.$gte = startDate;
  if (endDate) dateFilter.$lte = endDate;

  // --- Build match filter ---
  const matchFilter = {
    type,
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

export const findActiveDriversCount = async () =>
  Driver.countDocuments({
    status: { $in: ['online', 'on_ride'] },
    isBlocked: false,
    isSuspended: false,
    isDeleted: false,
    isApproved: true,
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

  // Fetch driver locations in a single query
  const locations = await DriverLocation.find({
    driverId: { $in: driverIds },
  }).lean();

  // Merge ride with driver location
  const rideData = rides.map((ride) => {
    const loc = locations.find(
      (l) => l.driverId.toString() === ride.driverId.toString(),
    );
    return {
      rideId: ride._id,
      status: ride.status,
      driverId: ride.driverId,
      location: loc
        ? { lng: loc.location.coordinates[0], lat: loc.location.coordinates[1] }
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
  if (startDate && endDate) {
    // ✅ Custom range with DD-MM-YYYY
    dateFilter = {
      createdAt: {
        $gte: parseDateDMY(startDate),
        $lte: parseDateDMY(endDate, true),
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
  const rideStats = await Booking.aggregate([
    {
      $match: {
        status: { $nin: excludeStatuses },
        ...dateFilter,
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
                  { $ifNull: ['$actualFare', false] },
                  { $eq: ['$paymentStatus', 'COMPLETED'] },
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

  // --- Total drivers ---
  const driverFilter = dateFilter.createdAt
    ? { createdAt: dateFilter.createdAt }
    : {};
  const totalDrivers = await Driver.countDocuments(driverFilter);

  // --- Passenger feedback stats ---
  const feedbackStats = await Feedback.aggregate([
    {
      $match: {
        type: 'by_passenger',
        ...dateFilter,
      },
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

  const reportedDriversPercentage =
    totalDrivers > 0 ? (totalReportedDrivers / totalDrivers) * 100 : 0;

  const reviewedDriversPercentage =
    totalDrivers > 0 ? (totalFeedbacks / totalDrivers) * 100 : 0;

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

  // --- Format helper ---
  const formatHours = (hours) => Number(hours.toFixed(2)); // 2 decimals

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
    reportedDriversPercentage: formatHours(reportedDriversPercentage),
    reviewedDriversPercentage: formatHours(reviewedDriversPercentage),
    rideHoursChart: chartData,
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

    // --- Aggregation ---
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

    // --- Chart data ---
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

    // Helper to compute repeated ride ratio
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
        const monthKey = `${startDate.getFullYear()}-${(m + 1)
          .toString()
          .padStart(2, '0')}`;
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
    };
  } catch (error) {
    console.error('Error in passengersAnalytics:', error);
    throw error;
  }
};

export const ridesAnalytics = async (filter = 'today') => {
  try {
    // --- Totals ---
    const [totalOngoingRides, totalCompletedRides, totalCancelledRides] =
      await Promise.all([
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
        chartData.push({
          hour: `${hourStr}:00`,
          rides: entry?.rides || 0,
        });
      }
    } else if (filter === 'this_week') {
      const curDate = new Date(startDate);
      for (let i = 0; i < 7; i++) {
        const dayKey = curDate.toISOString().split('T')[0];
        const entry = rideCounts.find((r) => r._id === dayKey);
        chartData.push({
          day: dayKey,
          dayName: daysOfWeek[curDate.getDay()],
          rides: entry?.rides || 0,
        });
        curDate.setDate(curDate.getDate() + 1);
      }
    } else if (filter === 'this_month') {
      const allDays = getAllDaysInMonth(now.getFullYear(), now.getMonth());
      allDays.forEach((date) => {
        const dayKey = date.toISOString().split('T')[0];
        const entry = rideCounts.find((r) => r._id === dayKey);
        chartData.push({
          day: dayKey,
          dayName: daysOfWeek[date.getDay()],
          rides: entry?.rides || 0,
        });
      });
    } else if (filter === 'last_year') {
      for (let m = 0; m < 12; m++) {
        const monthKey = `${startDate.getFullYear()}-${(m + 1)
          .toString()
          .padStart(2, '0')}`;
        const entry = rideCounts.find((r) => r._id === monthKey);
        chartData.push({
          month: monthKey,
          monthName: monthsOfYear[m],
          rides: entry?.rides || 0,
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

    // --- Aggregation ---
    const results = await Booking.aggregate([
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

    if (!results.length) {
      return {
        totalRevenue: 0,
        totalCommission: 0,
        driverProfit: 0,
        commissionPercentage: 0,
        paymentMethodRatio: { CARD: 0, WALLET: 0 },
        chart: [],
      };
    }

    const overall = results[0].overall[0] || {};
    const {
      totalRevenue = 0,
      totalCommission = 0,
      cardPayments = 0,
      walletPayments = 0,
      totalPayments = 0,
    } = overall;

    const driverProfit = totalRevenue - totalCommission;
    const commissionPercentage =
      totalRevenue > 0
        ? Number(((totalCommission / totalRevenue) * 100).toFixed(2))
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

    const chartAgg = results[0].chart;
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
        const entry = chartAgg.find((r) => r._id === hourStr);
        chartData.push({
          hour: `${hourStr}:00`,
          revenue: entry?.revenue || 0,
        });
      }
    } else if (filter === 'this_week') {
      const curDate = new Date(startDate);
      for (let i = 0; i < 7; i++) {
        const dayKey = curDate.toISOString().split('T')[0];
        const entry = chartAgg.find((r) => r._id === dayKey);
        chartData.push({
          day: dayKey,
          dayName: daysOfWeek[curDate.getDay()],
          revenue: entry?.revenue || 0,
        });
        curDate.setDate(curDate.getDate() + 1);
      }
    } else if (filter === 'this_month') {
      const allDays = getAllDaysInMonth(now.getFullYear(), now.getMonth());
      allDays.forEach((date) => {
        const dayKey = date.toISOString().split('T')[0];
        const entry = chartAgg.find((r) => r._id === dayKey);
        chartData.push({
          day: dayKey,
          dayName: daysOfWeek[date.getDay()],
          revenue: entry?.revenue || 0,
        });
      });
    } else if (filter === 'last_year') {
      for (let m = 0; m < 12; m++) {
        const monthKey = `${startDate.getFullYear()}-${(m + 1)
          .toString()
          .padStart(2, '0')}`;
        const entry = chartAgg.find((r) => r._id === monthKey);
        chartData.push({
          month: monthKey,
          monthName: monthsOfYear[m],
          revenue: entry?.revenue || 0,
        });
      }
    }

    return {
      totalRevenue,
      totalCommission,
      driverProfit,
      commissionPercentage,
      paymentMethodRatio,
      chart: chartData,
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

export const addOrUpdateCommission = async ({ carType, percentage }) => {
  // Validate input
  if (!CAR_TYPES.includes(carType)) {
    throw new Error(`Invalid carType. Allowed: ${CAR_TYPES.join(', ')}`);
  }

  if (percentage < 0) {
    throw new Error('Percentage must be 0 or higher');
  }

  // Either update if exists, or insert new
  const commission = await Commission.findOneAndUpdate(
    { carType },
    { carType, percentage },
    { upsert: true, new: true },
  );

  return commission;
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
    const regex = new RegExp(search.trim(), 'i');
    filter.$or = [{ carType: regex }, { 'rideId.rideId': regex }];
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

export const createAlert = async ({ user, audience, recipients, blocks }) =>
  Alert.create({
    createdBy: user._id,
    audience,
    recipients: recipients || [],
    blocks,
    status: 'PENDING',
  });

// --- Main ---
export const sendAlert = async (alertId) => {
  const alert = await Alert.findById(alertId);
  if (!alert) throw new Error('Alert not found');

  alert.status = 'IN_PROGRESS';
  await alert.save();

  // Build user query based on audience
  let userQuery = { userDeviceToken: { $exists: true, $ne: null } };

  if (alert.audience === 'custom') {
    userQuery._id = { $in: alert.recipients || [] };
  } else if (alert.audience === 'drivers') {
    userQuery.roles = { $in: ['driver'] };
  } else if (alert.audience === 'passengers') {
    userQuery.roles = { $in: ['passenger'] };
  }
  // audience = all → keep base query

  // Stream users to avoid memory blowup
  const cursor = User.find(userQuery)
    .select('_id userDeviceToken')
    .lean()
    .cursor();

  let stats = { totalTargets: 0, sent: 0, failed: 0, invalidTokens: 0 };
  const primaryBlock = (alert.blocks && alert.blocks[0]) || {
    title: '',
    body: '',
    data: {},
  };

  let collector = [];

  for await (const user of cursor) {
    if (!user.userDeviceToken) continue;
    collector.push({ token: user.userDeviceToken, userId: user._id });

    if (collector.length >= BATCH_SIZE) {
      const res = await _sendBatch(collector, primaryBlock);
      stats = _sumStats(stats, res);
      collector = [];
    }
  }

  // leftover batch
  if (collector.length) {
    const res = await _sendBatch(collector, primaryBlock);
    stats = _sumStats(stats, res);
  }

  // Update alert stats
  alert.stats = {
    totalTargets: stats.totalTargets,
    sent: stats.sent,
    failed: stats.failed,
    invalidTokens: stats.invalidTokens,
  };
  alert.status =
    stats.failed === 0 ? 'SENT' : stats.sent === 0 ? 'FAILED' : 'SENT';
  await alert.save();

  return stats;
};

// --- Batch sender ---
const _sendBatch = async (items, block) => {
  const tokens = items.map((i) => i.token);
  const message = {
    notification: { title: block.title || '', body: block.body || '' },
    data: Object.keys(block.data || {}).reduce(
      (acc, k) => ({ ...acc, [k]: String(block.data[k]) }),
      {},
    ),
    tokens,
  };

  const result = {
    totalTargets: tokens.length,
    sent: 0,
    failed: 0,
    invalidTokens: 0,
  };

  try {
    const resp = await messaging.sendEachForMulticast(message);

    for (let i = 0; i < resp.responses.length; i++) {
      const r = resp.responses[i];
      const token = tokens[i];

      if (r.success) {
        result.sent++;
      } else {
        result.failed++;
        if (isInvalidTokenError(r.error)) {
          result.invalidTokens++;
          // mark token as invalid in User schema
          await mongoose
            .model('User')
            .updateOne(
              { userDeviceToken: token },
              { $unset: { userDeviceToken: 1 } },
            )
            .exec();
        }
      }
    }
  } catch (err) {
    console.error('_sendBatch fatal error', err);
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

export const findAllAlerts = async ({
  page = 1,
  limit = 10,
  fromDate,
  toDate,
  search = "",
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

  // Search filter (title, status, or createdAt as string)
  if (search) {
    const regex = new RegExp(search, 'i'); // case-insensitive
    filter.$or = [
      { title: regex },
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

  return {
    data: alerts,
    pagination: {
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit),
    },
  };
};
