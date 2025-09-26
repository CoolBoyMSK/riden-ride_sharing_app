import AdminModel from '../../models/Admin.js';
import UpdateRequest from '../../models/updateRequest.js';
import Booking from '../../models/Ride.js';
import Feedback from '../../models/Feedback.js';
import mongoose from 'mongoose';

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

const parseDateDMY = (dateStr, endOfDay = false) => {
  if (!dateStr) return null;
  const [day, month, year] = dateStr.split('-').map(Number);
  if (!day || !month || !year) return null;
  const date = new Date(year, month - 1, day);
  if (endOfDay) date.setHours(23, 59, 59, 999);
  return date;
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
