import PassengerModel from '../models/Passenger.js';
import UserModel from '../models/User.js';
import UpdateRequestModel from '../models/updateRequest.js';

export const findPassenger = (filter, project = {}, options = {}) =>
  PassengerModel.findOne(filter, project, options);

export const findPassengerById = async (id) =>
  PassengerModel.findById(id).populate('userId').lean();

export const findPassengerDetails = (filter) =>
  PassengerModel.findOne(filter).populate('userId');

export const findPassengerByUserId = (userId, options = {}) => {
  let query = PassengerModel.findOne({ userId });
  if (options.session) query = query.session(options.session);
  return query.lean();
};

export const createPassengerProfile = (userId, uniqueId) =>
  new PassengerModel({
    userId,
    uniqueId,
  }).save();

export const countPassengers = () => PassengerModel.countDocuments();

export const updatePassenger = (filter, payload, options = {}) =>
  PassengerModel.findOneAndUpdate(filter, payload, { new: true, ...options });

export const updatePassengerById = (passengerId, payload) =>
  PassengerModel.findByIdAndUpdate(passengerId, payload, { new: true });

export const deletePassenger = async (filter) => {
  const user = await UserModel.findOneAndDelete({ _id: filter.userId });
  if (!user) {
    return false;
  }
  return PassengerModel.findOneAndDelete({ _id: filter.passengerId });
};

export const updatePassengerBlockStatus = (passengerId, isBlocked) =>
  PassengerModel.findByIdAndUpdate(
    passengerId,
    { isBlocked },
    { new: true },
  ).lean();

export const findPassengers = (filter = {}, { page, limit }) =>
  PassengerModel.find(filter)
    .skip((page - 1) * limit)
    .limit(limit)
    .populate({
      path: 'userId',
      select: 'name email phoneNumber profileImg roles',
    })
    .lean();

export const findPassengerUpdateRequests = async (
  filter = {},
  page = 1,
  limit = 10,
  search = '',
  fromDate,
  toDate,
) => {
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
            { 'user.email': { $regex: escapedSearch, $options: 'i' } },
            { 'user.phoneNumber': { $regex: escapedSearch, $options: 'i' } },
          ],
        }
      : {};

  // --- Date filter ---
  const dateFilter = {};
  if (fromDate) {
    const start = new Date(fromDate);
    if (!isNaN(start)) dateFilter.$gte = start;
  }
  if (toDate) {
    const end = new Date(`${toDate}T23:59:59.999Z`);
    if (!isNaN(end)) dateFilter.$lte = end;
  }

  const [result] = await UpdateRequestModel.aggregate([
    {
      $lookup: {
        from: 'users',
        localField: 'userId',
        foreignField: '_id',
        as: 'user',
      },
    },
    { $unwind: '$user' },

    // Merge search, roles, and other filters
    {
      $match: {
        'user.roles': { $regex: /^passenger$/i },
        ...filter,
        ...(Object.keys(searchMatch).length ? searchMatch : {}),
        ...(Object.keys(dateFilter).length ? { createdAt: dateFilter } : {}),
      },
    },

    {
      $facet: {
        metadata: [{ $count: 'total' }],
        data: [
          { $sort: { createdAt: -1 } },
          { $skip: skip },
          { $limit: safeLimit },
          {
            $project: {
              _id: 1,
              status: 1,
              request: 1,
              createdAt: 1,
              updatedAt: 1,
              'user._id': 1,
              'user.name': 1,
              'user.email': 1,
              'user.phoneNumber': 1,
              'user.profileImg': 1,
              'user.roles': 1,
              'user.gender': 1,
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

export const updatePassengerRequest = async (requestId, status, session) => {
  const request = await UpdateRequestModel.findOneAndUpdate(
    { _id: requestId },
    { status },
    { new: true, session }, // return the updated document
  ).lean();

  if (!request) throw new Error('Update request not found');

  if (status === 'approved') {
    const fieldToUpdate = request.request?.field;
    const newValue = request.request?.new;

    if (!fieldToUpdate || newValue === undefined) {
      throw new Error('Invalid request: missing field or new value');
    }

    const updateObj = { [fieldToUpdate]: newValue };

    const updatedUser = await UserModel.findOneAndUpdate(
      { _id: request.userId },
      updateObj,
      { new: true, session },
    )
      .select('name email phoneNumber roles gender profileImg')
      .lean();

    if (!updatedUser) throw new Error('User not found');

    return updatedUser;
  } else {
    return request;
  }
};

export const findPassengersWithSearch = async (
  search = '',
  page = 1,
  limit = 10,
  fromDate,
  toDate,
) => {
  // --- Normalize pagination ---
  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.max(parseInt(limit, 10) || 10, 1);
  const skip = (pageNum - 1) * limitNum;

  // --- Prepare search term safely ---
  const safeSearch = typeof search === 'string' ? search.trim() : '';
  const escapedSearch = safeSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // --- Build search match stage (UNCHANGED) ---
  const matchStage =
    safeSearch.length > 0
      ? {
          $or: [
            { 'user.name': { $regex: escapedSearch, $options: 'i' } },
            { 'user.email': { $regex: escapedSearch, $options: 'i' } },
            { 'user.phoneNumber': { $regex: escapedSearch, $options: 'i' } },
          ],
        }
      : {};

  // --- Build date filter if provided ---
  const dateFilter = {};
  if (fromDate) {
    const start = new Date(fromDate);
    if (!isNaN(start)) dateFilter.$gte = start;
  }
  if (toDate) {
    const end = new Date(`${toDate}T23:59:59.999Z`);
    if (!isNaN(end)) dateFilter.$lte = end;
  }

  // --- Aggregation pipeline ---
  const pipeline = [
    {
      $lookup: {
        from: 'users',
        localField: 'userId',
        foreignField: '_id',
        as: 'user',
      },
    },
    { $unwind: '$user' },

    // Apply search filter only if present
    ...(Object.keys(matchStage).length ? [{ $match: matchStage }] : []),

    // Apply date filter only if present (createdAt field)
    ...(Object.keys(dateFilter).length
      ? [{ $match: { createdAt: dateFilter } }]
      : []),

    // Count rides
    {
      $lookup: {
        from: 'rides',
        localField: '_id',
        foreignField: 'passengerId',
        as: 'rides',
      },
    },
    {
      $addFields: {
        bookings: { $size: '$rides' },
      },
    },

    { $sort: { createdAt: -1 } },

    {
      $facet: {
        metadata: [{ $count: 'total' }],
        data: [
          { $skip: skip },
          { $limit: limitNum },
          {
            $project: {
              uniqueId: 1,
              isActive: 1,
              isBlocked: 1,
              bookings: 1,
              createdAt: 1,
              updatedAt: 1,
              'user._id': 1,
              'user.name': 1,
              'user.email': 1,
              'user.phoneNumber': 1,
              'user.profileImg': 1,
              'user.roles': 1,
            },
          },
        ],
      },
    },
  ];

  const result = await PassengerModel.aggregate(pipeline);

  const total = result?.[0]?.metadata?.[0]?.total || 0;
  const data = result?.[0]?.data || [];

  return {
    data,
    total,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil(total / limitNum),
  };
};
