import Driver from '../models/Driver.js';
import Payout from '../models/Payout.js';
import InstantPayoutRequest from '../models/InstantPayoutRequest.js';

const parseDate = (dateStr, endOfDay = false) => {
  if (!dateStr) return null;
  const [day, month, year] = dateStr.split('-').map(Number);
  if (!day || !month || !year) return null;

  return endOfDay
    ? new Date(year, month - 1, day, 23, 59, 59, 999)
    : new Date(year, month - 1, day, 0, 0, 0, 0);
};

export const findUpcomingPayouts = async ({
  page = 1,
  limit = 10,
  search = '',
}) => {
  const skip = (page - 1) * limit;

  // Base filter: balance > 0 and at least 1 ride
  const query = {
    balance: { $gt: 0 },
    rideIds: { $exists: true, $not: { $size: 0 } },
  };

  // Add search filter if provided
  if (search.trim()) {
    query['$or'] = [
      { uniqueId: { $regex: search, $options: 'i' } }, // search in Driver uniqueId
      { 'userId.name': { $regex: search, $options: 'i' } }, // search in populated User name
    ];
  }

  const drivers = await Driver.find(query)
    .populate({
      path: 'userId',
      select: 'name email profileImg', // only include name and email
    })
    .skip(skip)
    .limit(limit)
    .lean();

  const total = await Driver.countDocuments(query);

  return {
    data: drivers,
    page: page ? parseInt(page) : null,
    limit: limit ? parseInt(limit) : null,
    total,
    totalPages: Math.ceil(total / limit),
  };
};

export const findPreviousPayouts = async ({
  page = 1,
  limit = 10,
  search = '',
  fromDate,
  toDate,
}) => {
  const pageNumber = Number(page) || 1;
  const limitNumber = Number(limit) || 10;
  const skip = (pageNumber - 1) * limitNumber;

  const match = {};

  // Date filter
  if (fromDate || toDate) {
    match.payoutDate = {};
    if (fromDate) match.payoutDate.$gte = parseDate(fromDate);
    if (toDate) match.payoutDate.$lte = parseDate(toDate, true);
  }

  const pipeline = [
    { $match: match },
    {
      $lookup: {
        from: 'drivers',
        localField: 'driverId',
        foreignField: '_id',
        as: 'driver',
      },
    },
    { $unwind: '$driver' },
    {
      $lookup: {
        from: 'users',
        localField: 'driver.userId',
        foreignField: '_id',
        as: 'driver.user',
      },
    },
    { $unwind: '$driver.user' },
  ];

  // Search
  if (search.trim()) {
    pipeline.push({
      $match: {
        $or: [
          { 'driver.user.name': { $regex: search, $options: 'i' } },
          { 'driver.uniqueId': { $regex: search, $options: 'i' } },
        ],
      },
    });
  }

  // Project fields
  pipeline.push({
    $project: {
      _id: 1,
      amount: 1,
      payoutType: 1,
      status: 1,
      payoutDate: 1,
      rideCount: { $size: '$rides' },
      driver: {
        _id: '$driver._id',
        uniqueId: '$driver.uniqueId',
        balance: '$driver.balance',
        user: {
          _id: '$driver.user._id',
          name: '$driver.user.name',
          email: '$driver.user.email',
        },
      },
    },
  });

  // Count total documents
  const countPipeline = [...pipeline, { $count: 'total' }];
  const countResult = await Payout.aggregate(countPipeline);
  const total = countResult[0]?.total || 0;

  // Pagination
  pipeline.push({ $skip: skip }, { $limit: limitNumber });

  const payouts = await Payout.aggregate(pipeline);

  return {
    data: payouts,
    page: pageNumber,
    limit: limitNumber,
    total,
    totalPages: Math.ceil(total / limitNumber),
  };
};

export const findInstantPayoutRequests = async ({
  page = 1,
  limit = 10,
  search = '',
  fromDate,
  toDate,
}) => {
  const pageNumber = Number(page) || 1;
  const limitNumber = Number(limit) || 10;
  const skip = (pageNumber - 1) * limitNumber;

  const match = {};

  // Filter by date range (requestedAt)
  if (fromDate || toDate) {
    match.requestedAt = {};
    if (fromDate) match.requestedAt.$gte = parseDate(fromDate);
    if (toDate) match.requestedAt.$lte = parseDate(toDate, true);
  }

  const pipeline = [
    { $match: match },
    {
      $lookup: {
        from: 'drivers',
        localField: 'driverId',
        foreignField: '_id',
        as: 'driver',
      },
    },
    { $unwind: '$driver' },
    {
      $lookup: {
        from: 'users',
        localField: 'driver.userId',
        foreignField: '_id',
        as: 'driver.user',
      },
    },
    { $unwind: '$driver.user' },
    {
      $lookup: {
        from: 'driverwallets',
        localField: 'driverId',
        foreignField: 'driverId',
        as: 'wallet',
      },
    },
    {
      $unwind: {
        path: '$wallet',
        preserveNullAndEmptyArrays: true, // Handle drivers without wallet
      },
    },
  ];

  // Search only on driver name and uniqueId
  if (search.trim()) {
    pipeline.push({
      $match: {
        $or: [
          { 'driver.user.name': { $regex: search, $options: 'i' } },
          { 'driver.uniqueId': { $regex: search, $options: 'i' } },
        ],
      },
    });
  }

  // Project desired fields + ride count
  pipeline.push({
    $project: {
      _id: 1,
      amount: 1,
      status: 1,
      requestedAt: 1,
      approvedAt: 1,
      paidAt: 1,
      rideCount: { $size: '$rides' },
      driver: {
        _id: '$driver._id',
        uniqueId: '$driver.uniqueId',
        balance: { $ifNull: ['$wallet.availableBalance', 0] }, // Use DriverWallet.availableBalance
        user: {
          _id: '$driver.user._id',
          name: '$driver.user.name',
          email: '$driver.user.email',
        },
      },
    },
  });

  // Count total documents for pagination
  const countPipeline = [...pipeline, { $count: 'total' }];
  const countResult = await InstantPayoutRequest.aggregate(countPipeline);
  const total = countResult[0]?.total || 0;

  // Apply pagination
  pipeline.push({ $skip: skip }, { $limit: limitNumber });

  const requests = await InstantPayoutRequest.aggregate(pipeline);

  return {
    data: requests,
    page: pageNumber,
    limit: limitNumber,
    total,
    totalPages: Math.ceil(total / limitNumber),
  };
};

export const updateInstatnPayoutRequest = async ({ id, status }) =>
  InstantPayoutRequest.findByIdAndUpdate(
    id,
    { status },
    { new: true },
  ).populate('driverId');

export const countTotalPendingRequests = async () =>{
  const count = await InstantPayoutRequest.countDocuments({ status: 'PENDING' });
  return count
}