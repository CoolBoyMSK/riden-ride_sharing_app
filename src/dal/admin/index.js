import AdminModel from '../../models/Admin.js';
import UpdateRequest from '../../models/updateRequest.js';
import Booking from '../../models/Ride.js';
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
  const safePage =
    Number.isInteger(Number(page)) && Number(page) > 0 ? Number(page) : 1;
  const safeLimit =
    Number.isInteger(Number(limit)) && Number(limit) > 0 ? Number(limit) : 10;
  const skip = (safePage - 1) * safeLimit;

  // Escape and normalize search
  const safeSearch = typeof search === 'string' ? search.trim() : '';
  const escapedSearch = safeSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const dateFilter = {};
  if (fromDate) {
    const start = new Date(fromDate);
    if (!isNaN(start)) dateFilter.$gte = start;
  }
  if (toDate) {
    const end = new Date(`${toDate}T23:59:59.999Z`);
    if (!isNaN(end)) dateFilter.$lte = end;
  }

  const [result] = await Booking.aggregate([
    // Lookup passenger user
    {
      $lookup: {
        from: 'users',
        localField: 'passengerId.userId',
        foreignField: '_id',
        as: 'passengerUser',
      },
    },
    { $unwind: { path: '$passengerUser', preserveNullAndEmptyArrays: true } },

    // Lookup driver user
    {
      $lookup: {
        from: 'users',
        localField: 'driverId.userId',
        foreignField: '_id',
        as: 'driverUser',
      },
    },
    { $unwind: { path: '$driverUser', preserveNullAndEmptyArrays: true } },

    // Build clean passenger and driver objects
    {
      $addFields: {
        passenger: {
          name: '$passengerUser.name',
          email: '$passengerUser.email',
          phoneNumber: '$passengerUser.phoneNumber',
        },
        driver: {
          name: '$driverUser.name',
          email: '$driverUser.email',
          phoneNumber: '$driverUser.phoneNumber',
        },
      },
    },

    // Match filters
    {
      $match: {
        status: {
          $in: [
            'RIDE_COMPLETED',
            'CANCELLED_BY_PASSENGER',
            'CANCELLED_BY_DRIVER',
            'CANCELLED_BY_SYSTEM',
          ],
        },
        ...(safeSearch
          ? {
              $or: [
                { 'passenger.name': { $regex: escapedSearch, $options: 'i' } },
                { 'passenger.email': { $regex: escapedSearch, $options: 'i' } },
                {
                  'passenger.phoneNumber': {
                    $regex: escapedSearch,
                    $options: 'i',
                  },
                },
                { 'driver.name': { $regex: escapedSearch, $options: 'i' } },
                { 'driver.email': { $regex: escapedSearch, $options: 'i' } },
                {
                  'driver.phoneNumber': {
                    $regex: escapedSearch,
                    $options: 'i',
                  },
                },
              ],
            }
          : {}),
        ...(Object.keys(dateFilter).length ? { createdAt: dateFilter } : {}),
      },
    },

    { $sort: { createdAt: -1 } },

    {
      $facet: {
        metadata: [{ $count: 'total' }],
        data: [
          { $skip: skip },
          { $limit: safeLimit },
          {
            $project: {
              _id: 1,
              rideId: 1,
              status: 1,
              createdAt: 1,
              updatedAt: 1,
              estimatedFare: 1,
              passenger: 1,
              driver: 1,
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
        actualDuration: 1,
        passengerRating: 1,
        driverRating: 1,
        paymentMethod: 1,

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
