import Payout from '../models/Payout.js';
import Transaction from '../models/Transaction.js';
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
  fromDate,
  toDate,
}) => {
  // --- Safe pagination ---
  const safePage =
    Number.isInteger(Number(page)) && Number(page) > 0 ? Number(page) : 1;
  const safeLimit =
    Number.isInteger(Number(limit)) && Number(limit) > 0 ? Number(limit) : 10;
  const skip = (safePage - 1) * safeLimit;

  // --- Normalize search ---
  const safeSearch = typeof search === 'string' ? search.trim() : '';
  const escapedSearch = safeSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const searchMatch =
    safeSearch.length > 0
      ? {
          $or: [
            { 'user.name': { $regex: escapedSearch, $options: 'i' } },
            { 'driver.uniqueId': { $regex: escapedSearch, $options: 'i' } },
          ],
        }
      : {};

  // --- Date filter (DD-MM-YYYY) ---
  const dateFilter = {};
  const from = parseDate(fromDate, false);
  const to = parseDate(toDate, true);
  if (from) dateFilter.$gte = from;
  if (to) dateFilter.$lte = to;

  // --- Base filters ---
  const matchFilter = {
    balance: { $gt: 0 },
    rides: { $gt: 0 },
    ...(Object.keys(dateFilter).length ? { createdAt: dateFilter } : {}),
  };

  // --- Aggregation pipeline ---
  const [result] = await Payout.aggregate([
    { $match: matchFilter },

    // Join driver
    {
      $lookup: {
        from: 'drivers',
        localField: 'driverId',
        foreignField: '_id',
        as: 'driver',
      },
    },
    { $unwind: '$driver' },

    // Join user
    {
      $lookup: {
        from: 'users',
        localField: 'driver.userId',
        foreignField: '_id',
        as: 'user',
      },
    },
    { $unwind: '$user' },

    // Apply search
    ...(Object.keys(searchMatch).length ? [{ $match: searchMatch }] : []),

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
              balance: 1,
              rides: 1,
              createdAt: 1,
              driver: { _id: 1, uniqueId: 1 },
              user: {
                _id: 1,
                name: 1,
                email: 1,
                phoneNumber: 1,
                profileImg: 1,
              },
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

export const findPreviousPayouts = async ({
  page = 1,
  limit = 10,
  search = '',
  fromDate,
  toDate,
}) => {
  // --- Safe pagination ---
  const safePage =
    Number.isInteger(Number(page)) && Number(page) > 0 ? Number(page) : 1;
  const safeLimit =
    Number.isInteger(Number(limit)) && Number(limit) > 0 ? Number(limit) : 10;
  const skip = (safePage - 1) * safeLimit;

  // --- Normalize search ---
  const safeSearch = typeof search === 'string' ? search.trim() : '';
  const escapedSearch = safeSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const searchMatch =
    safeSearch.length > 0
      ? {
          $or: [
            { 'user.name': { $regex: escapedSearch, $options: 'i' } },
            { 'driver.uniqueId': { $regex: escapedSearch, $options: 'i' } },
          ],
        }
      : {};

  // --- Date filter ---
  const dateFilter = {};
  const from = parseDate(fromDate, false);
  const to = parseDate(toDate, true);
  if (from) dateFilter.$gte = from;
  if (to) dateFilter.$lte = to;

  // --- Base filters ---
  const matchFilter = {
    category: 'TRANSFER',
    type: 'DEBIT',
    rides: { $gt: 0 },
    amount: { $gt: 0 },
    ...(Object.keys(dateFilter).length ? { createdAt: dateFilter } : {}),
  };

  // --- Aggregation pipeline ---
  const [result] = await Transaction.aggregate([
    { $match: matchFilter },

    // Join driver
    {
      $lookup: {
        from: 'drivers',
        localField: 'driverId',
        foreignField: '_id',
        as: 'driver',
      },
    },
    { $unwind: '$driver' },

    // Join user (from driver.userId)
    {
      $lookup: {
        from: 'users',
        localField: 'driver.userId',
        foreignField: '_id',
        as: 'user',
      },
    },
    { $unwind: '$user' },

    // Apply search
    ...(Object.keys(searchMatch).length ? [{ $match: searchMatch }] : []),

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
              amount: 1,
              rides: 1,
              type: 1,
              category: 1,
              createdAt: 1,
              referenceId: 1,
              receiptUrl: 1,
              status: 1,
              driver: { _id: 1, uniqueId: 1 },
              user: {
                _id: 1,
                name: 1,
                email: 1,
                phoneNumber: 1,
                profileImg: 1,
              },
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

export const findInstantPayoutRequests = async ({
  page = 1,
  limit = 10,
  search = '',
  fromDate,
  toDate,
}) => {
  // --- Safe pagination ---
  const safePage =
    Number.isInteger(Number(page)) && Number(page) > 0 ? Number(page) : 1;
  const safeLimit =
    Number.isInteger(Number(limit)) && Number(limit) > 0 ? Number(limit) : 10;
  const skip = (safePage - 1) * safeLimit;

  // --- Normalize search ---
  const safeSearch = typeof search === 'string' ? search.trim() : '';
  const escapedSearch = safeSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const searchMatch =
    safeSearch.length > 0
      ? {
          $or: [
            { 'driver.uniqueId': { $regex: escapedSearch, $options: 'i' } },
            { 'user.name': { $regex: escapedSearch, $options: 'i' } },
          ],
        }
      : {};

  // --- Date filter ---
  const dateFilter = {};
  if (fromDate) dateFilter.$gte = new Date(fromDate);
  if (toDate) dateFilter.$lte = new Date(toDate);

  // --- Base filters ---
  const matchFilter = {
    status: { $in: ['pending', 'approved'] }, // ignore rejected
    ...(Object.keys(dateFilter).length ? { createdAt: dateFilter } : {}),
  };

  // --- Aggregation pipeline ---
  const [result] = await InstantPayoutRequest.aggregate([
    { $match: matchFilter },

    // Join driver
    {
      $lookup: {
        from: 'drivers',
        localField: 'driverId',
        foreignField: '_id',
        as: 'driver',
      },
    },
    { $unwind: '$driver' },

    // Join user (from driver.userId)
    {
      $lookup: {
        from: 'users',
        localField: 'driver.userId',
        foreignField: '_id',
        as: 'user',
      },
    },
    { $unwind: '$user' },

    // Apply search
    ...(Object.keys(searchMatch).length ? [{ $match: searchMatch }] : []),

    // Sort: pending first, approved after, then newest first
    {
      $addFields: {
        sortOrder: {
          $cond: [{ $eq: ['$status', 'pending'] }, 0, 1], // pending = 0, approved = 1
        },
      },
    },
    { $sort: { sortOrder: 1, createdAt: -1 } },

    {
      $facet: {
        metadata: [{ $count: 'total' }],
        data: [
          { $skip: skip },
          { $limit: safeLimit },
          {
            $project: {
              _id: 1,
              amount: 1,
              rides: 1,
              status: 1,
              createdAt: 1,
              driver: { _id: 1, uniqueId: 1 },
              user: {
                _id: 1,
                name: 1,
                email: 1,
                phoneNumber: 1,
                profileImg: 1,
              },
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

export const updateInstatnPayoutRequest = async ({ id, status }) =>
  InstantPayoutRequest.findByIdAndUpdate(
    id,
    { status },
    { new: true },
  ).populate(driverId);

export const countTotalPendingRequests = async () =>
  InstantPayoutRequest.countDocuments({ status: 'pending' });
