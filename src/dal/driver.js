import mongoose from 'mongoose';
import DriverModel from '../models/Driver.js';
import UserModel from '../models/User.js';
import UpdateRequestModel from '../models/updateRequest.js';
import { DOCUMENT_TYPES } from '../enums/driver.js';

export const findDriverByUserId = (userId) =>
  DriverModel.findOne({ userId }).lean();

export const createDriverProfile = (userId, uniqueId) =>
  new DriverModel({
    userId,
    uniqueId,
    licenseDocs: { frontUrl: '', backUrl: '' },
    vehicle: { make: '', model: '', plateNumber: '', color: '' },
    backgroundCheckStatus: 'pending',
    payoutDetails: { bankAccount: '', ifscCode: '' },
  }).save();

export const updateDriverByUserId = (id, update, options = {}) =>
  DriverModel.findOneAndUpdate({ userId: id }, update, {
    new: true,
    ...options,
  }).lean();

export const countDrivers = () => DriverModel.countDocuments();

export const findDrivers = ({ page, limit, filter = {} }) =>
  DriverModel.find(filter)
    .skip((page - 1) * limit)
    .limit(limit)
    .populate({
      path: 'userId',
      select: 'name email phoneNumber profileImg roles gender',
    })
    .lean();

export const findDriver = async (driverId) => {
  const objectId = new mongoose.Types.ObjectId(driverId);

  const [result] = await DriverModel.aggregate([
    // Match the specific driver
    { $match: { _id: objectId } },

    // Populate driver.userId
    {
      $lookup: {
        from: 'users',
        localField: 'userId',
        foreignField: '_id',
        as: 'user',
      },
    },
    { $unwind: '$user' },

    // Lookup bookings for this driver
    {
      $lookup: {
        from: 'bookings',
        let: { driverId: '$_id' },
        pipeline: [
          { $match: { $expr: { $eq: ['$driverId', '$$driverId'] } } },

          {
            $lookup: {
              from: 'passengers',
              localField: 'passengerId',
              foreignField: '_id',
              as: 'passenger',
            },
          },
          { $unwind: '$passenger' },

          {
            $lookup: {
              from: 'users',
              localField: 'passenger.userId',
              foreignField: '_id',
              as: 'passenger.user',
            },
          },
          { $unwind: '$passenger.user' },

          { $project: { driverId: 0 } },
        ],
        as: 'bookings',
      },
    },

    // Add statistics
    {
      $addFields: {
        totalBookings: { $size: '$bookings' },
        completedBookings: {
          $size: {
            $filter: {
              input: '$bookings',
              as: 'b',
              cond: { $eq: ['$$b.status', 'RIDE_COMPLETED'] },
            },
          },
        },
        canceledBookings: {
          $size: {
            $filter: {
              input: '$bookings',
              as: 'b',
              cond: {
                $in: [
                  '$$b.status',
                  [
                    'CANCELLED_BY_PASSENGER',
                    'CANCELLED_BY_DRIVER',
                    'CANCELLED_BY_SYSTEM',
                  ],
                ],
              },
            },
          },
        },
        totalRevenue: {
          $sum: {
            $map: {
              input: {
                $filter: {
                  input: '$bookings',
                  as: 'b',
                  cond: { $eq: ['$$b.status', 'RIDE_COMPLETED'] },
                },
              },
              as: 'completed',
              in: '$$completed.fare',
            },
          },
        },
      },
    },

    // Merge the entire driver document with its populated user
    {
      $project: {
        _id: 0,
        driver: {
          $mergeObjects: ['$$ROOT', { user: '$user' }],
        },
        bookings: 1,
        totalBookings: 1,
        completedBookings: 1,
        canceledBookings: 1,
        totalRevenue: 1,
      },
    },
  ]);

  if (!result) return null;
  return result;
};

export const addDriverSuspension = (driverId, reason, endDate) =>
  DriverModel.findByIdAndUpdate(
    driverId,
    {
      status: 'suspended',
      $push: {
        suspensions: { reason, start: new Date(), end: new Date(endDate) },
      },
      $set: { isSuspended: true },
    },
    { new: true },
  ).lean();

export const removeDriverSuspension = (driverId) =>
  DriverModel.findByIdAndUpdate(
    driverId,
    { $set: { status: 'offline', isSuspended: false } },
    { new: true },
  ).lean();

export const addDriverBlock = (driverId) =>
  DriverModel.findByIdAndUpdate(
    driverId,
    { $set: { status: 'blocked', isBlocked: true } },
    { new: true },
  ).lean();

export const removeDriverBlock = (driverId) =>
  DriverModel.findByIdAndUpdate(
    driverId,
    { $set: { status: 'offline', isBlocked: false } },
    { new: true },
  ).lean();

export const findDriverDocuments = (driverId) =>
  DriverModel.findById(driverId, { documents: 1, _id: 0 }).lean();

export const updateDriverDocumentRecord = (driverId, docType, imageUrl) =>
  DriverModel.findOneAndUpdate(
    { userId: driverId },
    {
      $set: {
        [`documents.${docType}.imageUrl`]: imageUrl,
        [`documents.${docType}.status`]: 'submitted',
      },
    },
    { new: true, select: `documents.${docType}` },
  ).lean();

export const findVehicleByUserId = (userId) =>
  DriverModel.findOne({ userId }, 'vehicle').lean();

export const upsertVehicle = (userId, vehicle) =>
  DriverModel.findOneAndUpdate(
    { userId },
    { vehicle },
    { new: true, upsert: true, runValidators: true, select: 'vehicle' },
  ).lean();

export const patchVehicleFields = (userId, updates) =>
  DriverModel.findOneAndUpdate(
    { userId },
    {
      $set: Object.fromEntries(
        Object.entries(updates).map(([k, v]) => [`vehicle.${k}`, v]),
      ),
    },
    { new: true, runValidators: true, select: 'vehicle' },
  ).lean();

export const getfindDrivers = async ({
  page = 1,
  limit = 10,
  search = '',
  fromDate,
  toDate,
  isApproved, // true or false
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
            { uniqueId: { $regex: escapedSearch, $options: 'i' } },
            { 'user.name': { $regex: escapedSearch, $options: 'i' } },
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

  // --- Build match filter ---
  const matchFilter = {
    ...(typeof isApproved === 'boolean' ? { isApproved } : {}),
    ...(Object.keys(searchMatch).length ? searchMatch : {}),
    ...(Object.keys(dateFilter).length ? { createdAt: dateFilter } : {}),
  };

  // --- Aggregation pipeline ---
  const [result] = await DriverModel.aggregate([
    {
      $lookup: {
        from: 'users',
        localField: 'userId',
        foreignField: '_id',
        as: 'user',
      },
    },
    { $unwind: '$user' },
    { $match: matchFilter },
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
              uniqueId: 1,
              isApproved: 1,
              status: 1,
              suspensions: 1,
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

export const deleteDriver = async (driverId, session) => {
  const driver = await DriverModel.findById(driverId).session(session);
  if (!driver) return false;

  const user = await UserModel.findById(driver.userId).session(session);
  if (!user) return false;

  await DriverModel.deleteOne({ _id: driverId }).session(session);
  await UserModel.deleteOne({ _id: driver.userId }).session(session);

  return true;
};

export const updateDocumentStatus = (driverId, type, status, options = {}) => {
  return DriverModel.findOneAndUpdate(
    { _id: driverId },
    { $set: { [`documents.${type}.status`]: status } },
    { new: true, ...options },
  );
};

export const createDriverUpdateRequest = (
  userId,
  field,
  oldValue,
  newValue,
  options = {},
) =>
  UpdateRequestModel.create({
    userId,
    request: { field, old: oldValue, new: newValue },
    options,
  });

export const findDriverUpdateRequests = async (
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
        'user.roles': { $regex: /^driver$/i },
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

export const updateDriverRequest = async (requestId, status, options = {}) => {
  const request = await UpdateRequestModel.findOneAndUpdate(
    { _id: requestId },
    { status },
    { new: true, ...options },
  ).lean();

  if (!request) throw new Error('Update request not found');

  if (status === 'approved') {
    let fieldToUpdate = request.request?.field;
    let newValue = request.request?.new;

    if (!fieldToUpdate || newValue === undefined) {
      throw new Error('Invalid request: missing field or new value');
    }

    if (DOCUMENT_TYPES.includes(request.request?.field)) {
      const updatedUser = await updateDriverByUserId(
        request.userId,
        {
          $set: {
            [`documents.${fieldToUpdate}.imageUrl`]: newValue,
          },
        },
        options,
      );

      return updatedUser;
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

export const updateDriverLegalAgreement = async (
  driverId,
  status,
  options = {},
) => {
  if (status === 'accepted') {
    const updated = await DriverModel.findByIdAndUpdate(
      driverId,
      { legalAgreemant: true },
      { new: true, ...options },
    ).lean();

    return updated;
  } else {
    return null;
  }
};
