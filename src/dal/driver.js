import mongoose from 'mongoose';
import DriverModel from '../models/Driver.js';
import UserModel from '../models/User.js';
import UpdateRequestModel from '../models/updateRequest.js';
import DestinationModel from '../models/Destination.js';
import RideModel from '../models/Ride.js';
import DriverWallet from '../models/DriverWallet.js';
import DriverLocation from '../models/DriverLocation.js';
import FareManagement from '../models/fareManagement.js';
import { DOCUMENT_TYPES } from '../enums/driver.js';
import { findUserById } from './user/index.js';
import { sendDocumentEditRequestApprovalEmail } from '../templates/emails/user/index.js';
import { emitToUser, emitToRide } from '../realtime/socket.js';
import { notifyUser, createAdminNotification } from '../dal/notification.js';
import env from '../config/envConfig.js';
import Queue from 'bull';
import Redis from 'ioredis';
import User from '../models/User.js';

export const findDriverByUserId = (userId, { session } = {}) => {
  let query = DriverModel.findOne({ userId });
  if (session) query = query.session(session);
  return query.lean();
};

export const findDriverData = async (userId) =>
  DriverModel.findOne({ userId }).populate('userId');

export const findDriverByDriverId = async (id) =>
  DriverModel.findById(id).lean();

export const createDriverWallet = (driverId) =>
  new DriverWallet({
    driverId,
  }).save();

export const createDriverProfile = (userId, uniqueId) =>
  new DriverModel({
    userId,
    uniqueId,
    vehicle: { make: '', model: '', plateNumber: '', color: '' },
  }).save();

export const createDriverLocation = async (driverId) =>
  DriverLocation.create({
    driverId,
    location: { type: 'Point', coordinates: [0, 0] },
  });

export const toggleDriverLocation = async (driverId, status, isAvailable) =>
  DriverLocation.findOneAndUpdate(
    { driverId },
    { status, isAvailable },
    { new: true, upsert: true },
  );

export const updateDriverByUserId = async (id, update, options = {}) => {
  const objectId = mongoose.Types.ObjectId.isValid(id)
    ? new mongoose.Types.ObjectId(id)
    : id;

  const updatedDriver = await DriverModel.findOneAndUpdate(
    { userId: objectId },
    update,
    { new: true, session: options.session },
  );

  return updatedDriver;
};

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
        from: 'rides',
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

export const findDriverById = async (id) =>
  DriverModel.findById(id).populate('userId').lean();

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
    { $set: { status: 'offline', isActive: false, isSuspended: false } },
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

export const findWayBill = async (driverId, docType) => {
  return DriverModel.findById(driverId, {
    [`wayBill.${docType}`]: 1,
    _id: 0,
  }).lean();
};

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

export const updateWayBillDocuments = (driverId, docType, imageUrl) =>
  DriverModel.findOneAndUpdate(
    { userId: driverId },
    {
      $set: {
        [`wayBill.${docType}.imageUrl`]: imageUrl,
        [`wayBill.${docType}.status`]: 'issued',
      },
    },
    { new: true, select: `wayBill.${docType}` },
  ).lean();

export const findVehicleByUserId = async (userId, options = {}) =>
  DriverModel.findOne({ userId }, 'vehicle', {
    ...options,
  }).lean();

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

export const updateDocumentStatus = async (
  driverId,
  type,
  status,
  options = {},
) => {
  try {
    const driver = await DriverModel.findOneAndUpdate(
      { _id: driverId },
      { $set: { [`documents.${type}.status`]: status } },
      { new: true, ...options },
    );

    if (!driver) {
      throw new Error('Driver not found');
    }

    if (type === 'profilePicture' && status === 'verified') {
      const imageUrl = driver.documents?.profilePicture?.imageUrl;

      if (imageUrl) {
        await UserModel.findByIdAndUpdate(driver.userId, {
          profileImg: imageUrl,
        });
      }
    }

    return driver;
  } catch (error) {
    console.error('Error updating document status:', error);
    throw error;
  }
};

export const updateWayBillStatus = (driverId, type, status, options = {}) => {
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
    const [day, month, year] = fromDate.split('-');
    const start = new Date(`${year}-${month}-${day}T00:00:00.000Z`);
    if (!isNaN(start)) dateFilter.$gte = start;
  }
  if (toDate) {
    const [day, month, year] = toDate.split('-');
    const end = new Date(`${year}-${month}-${day}T23:59:59.999Z`);
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
    {
      $match: {
        'user.roles': { $regex: /^driver$/i },
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
              vehicleRequest: 1,
              // ✅ Format date as DD-MM-YYYY
              createdAt: {
                $dateToString: {
                  format: '%d-%m-%Y',
                  date: '$createdAt',
                },
              },
              updatedAt: {
                $dateToString: {
                  format: '%d-%m-%Y',
                  date: '$updatedAt',
                },
              },
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
  const finalStatus = status === 'approved' ? 'approved' : 'rejected';

  const request = await UpdateRequestModel.findOneAndUpdate(
    { _id: requestId },
    { status: finalStatus },
    { new: true, ...options },
  ).lean();

  if (!request) throw new Error('Update request not found');

  // 2️⃣ If rejected, return the rejected request
  if (finalStatus !== 'approved') return request;

  const user = await UserModel.findById(request.userId).lean();

  // 3️⃣ Handle Vehicle Update Requests
  if (request.vehicleRequest) {
    const newVehicle = request.vehicleRequest.new;
    if (!newVehicle) throw new Error('Invalid request: missing vehicle data');

    const updatedDriver = await DriverModel.findOneAndUpdate(
      { userId: request.userId },
      { $set: { vehicle: newVehicle } },
      { new: true, ...options },
    ).lean();

    if (!updatedDriver) throw new Error('Driver not found');

    const notify = await notifyUser({
      userId: user._id,
      title: 'Update Request Approved',
      message: `A driver ${user.name}'s vehicle update request has be approved`,
      module: 'support',
      metadata: { updatedDriver },
      type: 'ALERT',
      actionLink: null,
    });
    if (!notify) {
      console.log('Failed to send notification');
    }

    return updatedDriver;
  }

  // 4️⃣ Handle Other Requests (Documents or User Fields)
  const fieldToUpdate = request.request?.field;
  const newValue = request.request?.new;

  if (!fieldToUpdate || newValue === undefined) {
    throw new Error('Invalid request: missing field or new value');
  }

  // 📄 Update driver documents if field is a DOCUMENT_TYPE
  if (DOCUMENT_TYPES.includes(fieldToUpdate)) {
    const updatedDriver = await updateDriverByUserId(
      request.userId,
      {
        $set: {
          [`documents.${fieldToUpdate}.imageUrl`]: newValue,
        },
      },
      options,
    );

    if (!updatedDriver) throw new Error('Driver not found');

    const user = await findUserById(updatedDriver.userId);
    if (!user) throw new Error('User not found');

    await sendDocumentEditRequestApprovalEmail(
      user.userId?.email,
      user.userId.name,
    );

    return updatedDriver;
  }

  // 👤 Otherwise, update a field on the User model
  const updatedUser = await UserModel.findOneAndUpdate(
    { _id: request.userId },
    { [fieldToUpdate]: newValue },
    { new: true, ...options },
  )
    .select('name email phoneNumber roles gender profileImg')
    .lean();

  const notify = await notifyUser({
    userId: user._id,
    title: 'Update Request Approved',
    message: `A driver ${user.name}'s ${fieldToUpdate} update request has been approved`,
    module: 'support',
    metadata: { updatedUser },
    type: 'ALERT',
    actionLink: null,
  });
  if (!notify) {
    console.log('Failed to send notification');
  }

  if (!updatedUser) throw new Error('User not found');
  return updatedUser;
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

export const vehicleUpdateRequest = async (user, vehicle, options = {}) => {
  const oldVehicleRecord = await findVehicleByUserId(user._id, options);
  if (!oldVehicleRecord) {
    return false;
  }
  const doc = new UpdateRequestModel({
    userId: user._id,
    vehicleRequest: { new: vehicle, old: oldVehicleRecord.vehicle },
  });
  await doc.save(options);

  const notify = await notifyUser({
    userId: user._id,
    title: 'New Vehicle update Request',
    message: `A driver ${user.name} submitted vehicle update request`,
    module: 'support',
    metadata: { doc },
    module: 'driver_management',
    type: 'ALERT',
    actionLink: null,
  });
  if (!notify) {
    console.log('Failed to send notification');
  }
  return doc;
};

export const createDestination = async (
  driverId,
  location,
  title,
  address,
  options = {},
) => {
  const destination = new DestinationModel({
    driverId,
    location,
    title,
    address,
  });
  await destination.save({ session: options.session }); // <- bind session here
  return destination;
};

export const findAllDestination = async (driverId) =>
  DestinationModel.find({ driverId }).lean();

export const findDestinationById = async (id, driverId) =>
  DestinationModel.findOne({ _id: id, driverId }).lean();

export const updateDestinationById = async (id, payload, options = {}) =>
  DestinationModel.findByIdAndUpdate(id, payload, { new: true, ...options });

export const deleteDestinationById = async (id, driverId, options = {}) =>
  DestinationModel.findOneAndDelete({ _id: id, driverId }, { ...options });

export const updateDriverById = async (id, update, options = {}) =>
  DriverModel.findByIdAndUpdate(id, update, { new: true, ...options });

export const sendInstantPayoutRequest = async (driverId) =>
  PayoutRequest.create();

export const findDriverWayBill = async (driverId) => {
  const driverObjectId = new mongoose.Types.ObjectId(driverId);

  const result = await DriverModel.aggregate([
    {
      $match: { _id: driverObjectId },
    },
    // Get driver user info
    {
      $lookup: {
        from: 'users',
        localField: 'userId',
        foreignField: '_id',
        as: 'driverUser',
      },
    },
    { $unwind: { path: '$driverUser', preserveNullAndEmptyArrays: true } },

    // Get current ride if any
    {
      $lookup: {
        from: 'rides',
        let: { dId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$driverId', '$$dId'] },
                  {
                    $in: [
                      '$status',
                      [
                        'DRIVER_ASSIGNED',
                        'DRIVER_ARRIVING',
                        'DRIVER_ARRIVED',
                        'RIDE_STARTED',
                        'RIDE_IN_PROGRESS',
                      ],
                    ],
                  },
                ],
              },
            },
          },
          { $sort: { createdAt: -1 } }, // latest ride if multiple
          { $limit: 1 },
          {
            $lookup: {
              from: 'users',
              localField: 'passengerId',
              foreignField: '_id',
              as: 'passenger',
            },
          },
          { $unwind: { path: '$passenger', preserveNullAndEmptyArrays: true } },
          {
            $project: {
              rideId: 1,
              pickupLocation: { $ifNull: ['$pickupLocation', 'N/A'] },
              dropOffLocation: { $ifNull: ['$dropOffLocation', 'N/A'] },
              driverAssignedAt: { $ifNull: ['$driverAssignedAt', 'N/A'] },
              passenger: {
                userId: { $ifNull: ['$passenger.userId', 'N/A'] },
                name: { $ifNull: ['$passenger.name', 'N/A'] },
                email: { $ifNull: ['$passenger.email', 'N/A'] },
                profileImg: { $ifNull: ['$passenger.profileImg', 'N/A'] },
              },
            },
          },
        ],
        as: 'ride',
      },
    },
    { $unwind: { path: '$ride', preserveNullAndEmptyArrays: true } },

    // Final projection
    {
      $project: {
        ride: { $ifNull: ['$ride', null] },
        driver: {
          _id: { $ifNull: ['$_id', 'N/A'] },
          vehicle: { $ifNull: ['$vehicle', 'N/A'] },
          insurance: {
            $ifNull: ['$wayBill.certificateOfInsurance', 'N/A'],
          },
          documents: {
            $ifNull: [{ $mergeObjects: ['$wayBill', '$documents'] }, 'N/A'],
          },
          profile: {
            name: { $ifNull: ['$driverUser.name', 'N/A'] },
            email: { $ifNull: ['$driverUser.email', 'N/A'] },
            phoneNumber: { $ifNull: ['$driverUser.phoneNumber', 'N/A'] },
            profileImg: { $ifNull: ['$driverUser.profileImg', 'N/A'] },
          },
        },
      },
    },
  ]);

  return result.length ? result[0] : null;
};

export const findCompletedRide = async (rideId) => {
  const ride = await RideModel.findOne({
    _id: rideId,
    status: 'RIDE_COMPLETED',
    paymentStatus: 'COMPLETED',
  })
    .populate('passengerId driverId')
    .lean();

  return ride;
};

// Ride Search Logic
const redis = new Redis(env.REDIS_URL);
const driverSearchQueue = new Queue('driver search', env.REDIS_URL);

export const findNearbyDriverUserIds = async (
  carType,
  location,
  radius = 5000,
  { excludeDriverIds = [], limit = 50, session = null } = {},
) => {
  try {
    const aggregationPipeline = [
      // Stage 1: Find nearby available driver locations
      {
        $geoNear: {
          near: {
            type: 'Point',
            coordinates: location,
          },
          distanceField: 'distance',
          maxDistance: radius,
          spherical: true,
          key: 'location',
          query: {
            status: 'online',
            isAvailable: true,
            currentRideId: { $in: [null, undefined, ''] }, // ✅ No active ride
          },
        },
      },
      // Stage 2: Limit results
      { $limit: limit },
      // Stage 3: Lookup driver details
      {
        $lookup: {
          from: 'drivers',
          localField: 'driverId',
          foreignField: '_id',
          as: 'driver',
        },
      },
      // Stage 4: Unwind driver array
      { $unwind: '$driver' },
      // Stage 5: Match driver criteria
      {
        $match: {
          'driver.vehicle.type': carType,
          'driver.isBlocked': false,
          'driver.isSuspended': false,
          'driver.isActive': true,
          'driver.backgroundCheckStatus': 'approved',
          'driver.status': 'online',
          // ✅ EXCLUDE BY USER ID HERE (not driverId)
          ...(excludeDriverIds.length > 0 && {
            'driver.userId': { $nin: excludeDriverIds },
          }),
        },
      },
      // Stage 6: Lookup user to ensure user exists and get user details if needed
      {
        $lookup: {
          from: 'users',
          localField: 'driver.userId',
          foreignField: '_id',
          as: 'user',
        },
      },
      // Stage 7: Ensure user exists and is not blocked
      {
        $match: {
          user: { $ne: [] }, // User exists
          'user.0.isBlocked': { $ne: true }, // User not blocked
        },
      },
      // Stage 8: Project only the user ID
      {
        $project: {
          userId: '$driver.userId',
          distance: 1,
        },
      },
      // Stage 9: Sort by distance (closest first)
      {
        $sort: {
          distance: 1,
        },
      },
    ];

    const result = await DriverLocation.aggregate(aggregationPipeline).session(
      session || null,
    );

    const userIds = result.map((item) => item.userId.toString()); // Ensure string format
    return userIds;
  } catch (error) {
    console.error('Error finding nearby driver user IDs:', error);
    throw error;
  }
};

// Main function to handle progressive driver search
export const startProgressiveDriverSearch = async (ride) => {
  try {
    console.log(`Starting progressive driver search for ride ${ride.rideId}`);

    // Store ride in Redis for quick access
    await redis.setex(`ride:${ride._id}`, 180, JSON.stringify(ride)); // 3 minutes TTL

    // Add to search queue with delay options
    await driverSearchQueue.add(
      'search-drivers',
      { rideId: ride._id, phase: 1 },
      {
        delay: 0, // Start immediately
        jobId: `ride-search-${ride._id}`, // Unique job ID
        removeOnComplete: true,
        attempts: 1,
      },
    );

    // Set expiration for auto-cancellation
    await driverSearchQueue.add(
      'cancel-ride',
      { rideId: ride._id },
      {
        delay: 3 * 60 * 1000, // 3 minutes total
        jobId: `ride-cancel-${ride._id}`,
        removeOnComplete: true,
      },
    );
  } catch (error) {
    console.error('Error starting progressive driver search:', error);
  }
};

// Process driver search jobs
driverSearchQueue.process('search-drivers', 10, async (job) => {
  // 10 concurrent jobs
  const { rideId, phase } = job.data;

  try {
    const rideData = await redis.get(`ride:${rideId}`);
    if (!rideData) {
      console.log(`Ride ${rideId} not found or expired`);
      return;
    }

    const ride = JSON.parse(rideData);
    const currentRide = await getRideById(rideId);

    // Check if ride is still active
    if (!currentRide || currentRide.status !== 'REQUESTED') {
      console.log(`Ride ${rideId} is no longer active`);
      return;
    }

    if (phase === 1) {
      await handlePhase1Search(rideId, currentRide);
    } else if (phase === 2) {
      await handlePhase2Search(rideId, currentRide);
    }
  } catch (error) {
    console.error(`Error processing driver search for ride ${rideId}:`, error);
  }
});

// Process ride cancellation
driverSearchQueue.process('cancel-ride', 5, async (job) => {
  const { rideId } = job.data;

  try {
    const currentRide = await getRideById(rideId);
    if (currentRide && currentRide.status === 'REQUESTED') {
      console.log(`Auto-cancelling ride ${rideId} after 3 minutes`);
      await cancelExpiredRide(rideId);

      // Cleanup Redis
      await redis.del(`ride:${rideId}`);
    }
  } catch (error) {
    console.error(`Error cancelling ride ${rideId}:`, error);
  }
});

// Phase 1: 0-5km search for 2 minutes
const handlePhase1Search = async (rideId, ride) => {
  // Search for drivers in 0-5km
  await notifyDriversInRadius(ride, 5, 0);

  // Check if we should continue to next phase
  const searchCount = await redis.incr(`ride:${rideId}:phase1_searches`);

  if (searchCount >= 12) {
    // 2 minutes / 10 seconds = 12 searches
    // Schedule phase 2
    await driverSearchQueue.add(
      'search-drivers',
      { rideId, phase: 2 },
      { delay: 0, removeOnComplete: true },
    );

    // Cleanup phase 1 counter
    await redis.del(`ride:${rideId}:phase1_searches`);
  } else {
    // Schedule next phase 1 search in 10 seconds
    await driverSearchQueue.add(
      'search-drivers',
      { rideId, phase: 1 },
      {
        delay: 10 * 1000, // 10 seconds
        removeOnComplete: true,
      },
    );
  }
};

// Phase 2: 6-10km search for 1 minute
const handlePhase2Search = async (rideId, ride) => {
  // Update search radius
  await updateRideSearchRadius(rideId, 10);

  // Search for drivers in 6-10km
  await notifyDriversInRadius(ride, 10, 6);

  // Check if we should continue searching
  const searchCount = await redis.incr(`ride:${rideId}:phase2_searches`);

  if (searchCount < 6) {
    // 1 minute / 10 seconds = 6 searches
    // Schedule next phase 2 search in 10 seconds
    await driverSearchQueue.add(
      'search-drivers',
      { rideId, phase: 2 },
      {
        delay: 10 * 1000,
        removeOnComplete: true,
      },
    );
  } else {
    // Phase 2 completed, cleanup
    await redis.del(`ride:${rideId}:phase2_searches`);
  }
};

// Optimized notifyDriversInRadius function
export const notifyDriversInRadius = async (ride, maxRadius, minRadius = 0) => {
  try {
    const maxRadiusMeters = maxRadius * 1000;
    const minRadiusMeters = minRadius * 1000;

    // Use Redis cache to avoid duplicate notifications
    const cacheKey = `ride:${ride._id}:notified_drivers`;

    // Get all currently notified drivers from Redis
    const notifiedDrivers = await redis.smembers(cacheKey);
    let availableDrivers;

    if (minRadius === 0) {
      // 0-5km radius - exclude previously notified drivers
      availableDrivers = await findNearbyDriverUserIds(
        ride.carType,
        ride.pickupLocation.coordinates,
        maxRadiusMeters,
        { excludeDriverIds: notifiedDrivers },
      );
    } else {
      // 6-10km radius - exclude previously notified drivers
      availableDrivers = await findNearbyDriverUserIds(
        ride.carType,
        ride.pickupLocation.coordinates,
        maxRadiusMeters,
        { excludeDriverIds: notifiedDrivers },
      );

      // Filter by distance range
      if (availableDrivers.length > 0) {
        availableDrivers = await filterDriversByDistanceRange(
          ride.pickupLocation.coordinates,
          availableDrivers,
          minRadiusMeters,
          maxRadiusMeters,
        );
      }
    }

    if (!availableDrivers || availableDrivers.length === 0) {
      return false;
    }

    // Double-check filtering (should be empty if findNearbyDriverUserIds worked correctly)
    const newDrivers = availableDrivers.filter(
      (driverId) => !notifiedDrivers.includes(driverId),
    );

    if (newDrivers.length === 0) {
      return false;
    }

    const rideNotificationData = {
      success: true,
      objectType: 'new-ride',
      data: { ride, searchRadius: maxRadius },
      message: `New ride request from ${ride.pickupLocation.address} to ${ride.dropoffLocation.address} — tap to respond`,
    };

    // Notify ONLY new drivers
    for (const driverId of newDrivers) {
      emitToUser(driverId, 'ride:new_request', rideNotificationData);

      try {
        const notify = await notifyUser({
          userId: driverId,
          title: 'New Ride Request',
          message: `New ride request from ${ride.pickupLocation.address} to ${ride.dropoffLocation.address} — tap to respond`,
          module: 'ride',
          metadata: ride,
          actionLink: 'ride:find',
          isPush: true,
        });

        if (!notify) {
          console.log(`Failed to send notification to driver ${driverId}`);
        }
      } catch (error) {
        console.error(`Error notifying driver ${driverId}:`, error);
      }
    }

    // Store notified drivers in Redis
    if (newDrivers.length > 0) {
      await redis.sadd(cacheKey, newDrivers);
      await redis.expire(cacheKey, 180); // 3 minutes TTL
    }

    return true;
  } catch (error) {
    console.error(
      `Error notifying drivers in radius ${minRadius}-${maxRadius}km:`,
      error,
    );
    return false;
  }
};

// Cleanup when ride is accepted or cancelled
export const stopDriverSearch = async (rideId) => {
  try {
    // Remove from Redis
    await redis.del(`ride:${rideId}`);
    await redis.del(`ride:${rideId}:phase1_searches`);
    await redis.del(`ride:${rideId}:phase2_searches`);
    await redis.del(`ride:${rideId}:notified_drivers`);

    // Remove pending jobs from queue
    const jobs = await driverSearchQueue.getJobs(['delayed', 'waiting']);
    for (const job of jobs) {
      if (job.data.rideId === rideId) {
        await job.remove();
      }
    }

    console.log(`Stopped driver search for ride ${rideId}`);
  } catch (error) {
    console.error(`Error stopping driver search for ride ${rideId}:`, error);
  }
};

// Call this when ride is accepted or manually cancelled
export const onRideAccepted = async (rideId) => {
  await stopDriverSearch(rideId);
};

export const onRideCancelled = async (rideId) => {
  await stopDriverSearch(rideId);
};

const filterDriversByDistanceRange = async (
  pickupCoordinates,
  driverUserIds,
  minDistance,
  maxDistance,
) => {
  try {
    if (!driverUserIds || driverUserIds.length === 0) {
      return [];
    }

    // Get driver locations with distances using aggregation for better performance
    const driverLocations = await DriverLocation.aggregate([
      {
        $match: {
          userId: { $in: driverUserIds },
        },
      },
      {
        $lookup: {
          from: 'drivers',
          localField: 'driverId',
          foreignField: '_id',
          as: 'driver',
        },
      },
      {
        $unwind: '$driver',
      },
      {
        $project: {
          userId: 1,
          location: 1,
          distance: {
            $sqrt: {
              $add: [
                {
                  $pow: [
                    {
                      $subtract: [
                        '$location.coordinates[0]',
                        pickupCoordinates[0],
                      ],
                    },
                    2,
                  ],
                },
                {
                  $pow: [
                    {
                      $subtract: [
                        '$location.coordinates[1]',
                        pickupCoordinates[1],
                      ],
                    },
                    2,
                  ],
                },
              ],
            },
          },
        },
      },
      {
        $match: {
          distance: { $gte: minDistance / 100000, $lte: maxDistance / 100000 },
          // Note: Adjust the distance calculation based on your coordinate system
          // This is a simplified Euclidean distance for demonstration
        },
      },
    ]);

    return driverLocations.map((driverLoc) => driverLoc.userId);
  } catch (error) {
    console.error('Error filtering drivers by distance range:', error);
    return [];
  }
};

// Helper function to cancel expired ride
const cancelExpiredRide = async (rideId) => {
  try {
    const cancelledRide = await updateRideStatus(
      rideId,
      'CANCELLED_BY_SYSTEM',
      'No drivers available',
      'system',
    );

    if (cancelledRide) {
      // Notify passenger about cancellation
      emitToUser(cancelledRide.passengerId?.userId, 'ride:system_cancel_ride', {
        success: false,
        objectType: 'system-cancel-ride',
        data: cancelledRide,
        message: 'Ride cancelled. No drivers available in your area.',
      });

      console.log(
        `Ride ${rideId} automatically cancelled due to no drivers available`,
      );
    }
  } catch (error) {
    console.error('Error cancelling expired ride:', error);
  }
};

// 1. Update ride search radius
const updateRideSearchRadius = async (rideId, searchRadius) => {
  return await RideModel.findByIdAndUpdate(
    rideId,
    {
      searchRadius,
      $push: {
        searchHistory: {
          radius: searchRadius,
          timestamp: new Date(),
        },
      },
    },
    { new: true },
  );
};

// 2. Get ride by ID
const getRideById = async (rideId) => {
  return await RideModel.findById(rideId);
};

// 3. Update ride status
const updateRideStatus = async (
  rideId,
  status,
  cancellationReason = null,
  cancelledBy,
) => {
  const updateData = { status, cancelledBy, cancelledAt: new Date() };
  if (cancellationReason) {
    updateData.cancellationReason = cancellationReason;
  }
  return await RideModel.findByIdAndUpdate(rideId, updateData, {
    new: true,
  }).populate('passengerId');
};

export const checkSurgePricing = async (
  pickupCoordinates,
  carType,
  includeCurrentRide = false,
) => {
  try {
    const radiusMeters = 5 * 1000; // 5km in meters

    // Create a circular boundary for geoWithin query
    const center = {
      type: 'Point',
      coordinates: pickupCoordinates,
    };

    // Get active rides in 5km radius using $geoWithin
    const activeRidesCount = await RideModel.countDocuments({
      'pickupLocation.coordinates': {
        $geoWithin: {
          $centerSphere: [pickupCoordinates, radiusMeters / 6378100], // Convert meters to radians (Earth radius ~6378100m)
        },
      },
      status: 'REQUESTED',
      createdAt: {
        $gte: new Date(Date.now() - 10 * 60 * 1000), // Last 10 minutes
      },
    });

    // Calculate effective ride count (include current ride if specified)
    const effectiveRideCount = includeCurrentRide
      ? activeRidesCount + 1
      : activeRidesCount;

    // Get available drivers in 5km radius using $geoWithin
    const availableDriversCount = await DriverLocation.countDocuments({
      'location.coordinates': {
        $geoWithin: {
          $centerSphere: [pickupCoordinates, radiusMeters / 6378100], // Convert meters to radians
        },
      },
      status: 'online',
      isAvailable: true,
      currentRideId: { $in: [null, undefined] },
    });

    console.log(
      `📊 Surge Analysis: ${effectiveRideCount} rides (${activeRidesCount} existing + ${includeCurrentRide ? 1 : 0} current), ${availableDriversCount} drivers in 5km radius`,
    );

    // Calculate ride-to-driver ratio
    const rideToDriverRatio =
      availableDriversCount > 0
        ? effectiveRideCount / availableDriversCount
        : Infinity;

    console.log(
      `📐 Calculated ratio: ${rideToDriverRatio.toFixed(2)}:1 (${effectiveRideCount}/${availableDriversCount})`,
    );

    // Get surge configuration from FareManagement database
    const fareConfig = await FareManagement.findOne({ carType });
    if (!fareConfig) {
      console.log(`❌ No fare configuration found for car type: ${carType}`);
      return getNoSurgeResponse(
        effectiveRideCount,
        availableDriversCount,
        rideToDriverRatio,
        'No fare configuration found',
        includeCurrentRide,
      );
    }

    // Get current day for fare calculation
    const now = new Date();
    const currentDay = now.toLocaleString('en-US', { weekday: 'long' });

    // Find today's fare configuration
    const todayFare = fareConfig.dailyFares.find(
      (fare) => fare.day === currentDay,
    );
    if (!todayFare) {
      console.log(`❌ No fare configuration found for day: ${currentDay}`);
      return getNoSurgeResponse(
        effectiveRideCount,
        availableDriversCount,
        rideToDriverRatio,
        'No fare configuration for today',
        includeCurrentRide,
      );
    }

    // Check if surge configuration exists
    if (!todayFare.surge || todayFare.surge.length === 0) {
      console.log(
        `❌ No surge configuration found for ${carType} on ${currentDay}`,
      );
      return getNoSurgeResponse(
        effectiveRidesCount,
        availableDriversCount,
        rideToDriverRatio,
        'No surge configuration available',
        includeCurrentRide,
      );
    }

    console.log(
      `⚙️ Loaded ${todayFare.surge.length} surge levels from database:`,
    );
    todayFare.surge.forEach((level) => {
      console.log(
        `   - Level ${level.level}: ${level.ratio} = ${level.multiplier}x`,
      );
    });

    // Apply surge logic based on database configuration
    const surgeResult = calculateSurgeFromDB(
      effectiveRideCount,
      availableDriversCount,
      rideToDriverRatio,
      todayFare.surge,
    );

    // Prepare response
    const response = {
      isSurge: surgeResult.isSurge,
      surgeMultiplier: surgeResult.surgeMultiplier,
      surgeLevel: surgeResult.surgeLevel,
      message: surgeResult.message,
      rideCount: effectiveRideCount,
      existingRideCount: activeRidesCount,
      driverCount: availableDriversCount,
      rideToDriverRatio: parseFloat(rideToDriverRatio.toFixed(2)),
      requiredRidesForNextLevel: surgeResult.requiredRidesForNextLevel,
      includesCurrentRide: includeCurrentRide,
      surgeConfig: {
        carType,
        day: currentDay,
        configuredLevels: todayFare.surge.length,
      },
    };

    return response;
  } catch (error) {
    console.error('Error checking surge pricing:', error);
    return getNoSurgeResponse(
      0,
      0,
      0,
      'Error checking surge pricing',
      includeCurrentRide,
    );
  }
};

// Helper function to calculate surge from database configuration
const calculateSurgeFromDB = (
  activeRidesCount,
  availableDriversCount,
  rideToDriverRatio,
  surgeConfig,
) => {
  // Sort surge levels by ratio (ascending order) - lowest ratio first
  const sortedLevels = surgeConfig
    .filter((level) => level.level && level.ratio && level.multiplier)
    .sort((a, b) => {
      const ratioA = parseFloat(a.ratio.split(':')[0]);
      const ratioB = parseFloat(b.ratio.split(':')[0]);
      return ratioA - ratioB;
    });

  if (sortedLevels.length === 0) {
    return {
      isSurge: false,
      surgeMultiplier: 1.0,
      surgeLevel: 0,
      message: `No surge levels configured. ${activeRidesCount} rides, ${availableDriversCount} drivers available`,
      requiredRidesForNextLevel: null,
    };
  }

  let highestQualifyingLevel = null;

  console.log(`🔍 Checking surge levels from lowest to highest:`);

  // Find all qualifying levels
  for (let i = 0; i < sortedLevels.length; i++) {
    const level = sortedLevels[i];
    const requiredRatio = parseFloat(level.ratio.split(':')[0]);

    console.log(
      `   Level ${level.level}: requires ${requiredRatio}:1 ratio, current ratio: ${rideToDriverRatio.toFixed(2)}:1`,
    );

    if (rideToDriverRatio >= requiredRatio) {
      // This level qualifies
      console.log(
        `   ✅ Level ${level.level} qualifies (${level.multiplier}x)`,
      );

      // Keep track of the highest qualifying level
      if (
        !highestQualifyingLevel ||
        level.level > highestQualifyingLevel.level
      ) {
        highestQualifyingLevel = level;
      }
    } else {
      console.log(`   ❌ Level ${level.level} does not qualify`);
    }
  }

  // Apply the highest qualifying level found
  const isSurge = highestQualifyingLevel !== null;
  const surgeMultiplier = isSurge ? highestQualifyingLevel.multiplier : 1.0;
  const surgeLevel = isSurge ? highestQualifyingLevel.level : 0;

  // Prepare message and next level requirements
  let message;
  if (isSurge) {
    message = `🚨 SURGE LEVEL ${surgeLevel} (${highestQualifyingLevel.ratio})! ${activeRidesCount} rides waiting, ${availableDriversCount} drivers available (${rideToDriverRatio.toFixed(1)}:1 ratio)`;
  } else {
    message = `Normal pricing: ${activeRidesCount} rides, ${availableDriversCount} drivers available (${rideToDriverRatio.toFixed(1)}:1 ratio)`;
  }

  console.log(
    `🎯 Final applied surge level: ${surgeLevel}, multiplier: ${surgeMultiplier}x`,
  );

  const requiredRidesForNextLevel = getNextSurgeLevelRequirementFromDB(
    surgeLevel,
    activeRidesCount,
    availableDriversCount,
    sortedLevels,
  );

  return {
    isSurge,
    surgeMultiplier,
    surgeLevel,
    message,
    requiredRidesForNextLevel,
  };
};

// Helper function to get next surge level requirements from DB config
const getNextSurgeLevelRequirementFromDB = (
  currentLevel,
  currentRides,
  currentDrivers,
  surgeLevels,
) => {
  if (currentDrivers === 0) {
    return {
      nextLevel: null,
      message: 'No drivers available for surge calculation',
    };
  }

  // Find the next surge level
  const nextLevel = surgeLevels.find((level) => level.level > currentLevel);

  if (!nextLevel) {
    return {
      nextLevel: null,
      message: 'Maximum surge level reached',
    };
  }

  const requiredRatio = parseFloat(nextLevel.ratio.split(':')[0]);
  const requiredRides = Math.ceil(currentDrivers * requiredRatio);
  const additionalRidesNeeded = Math.max(0, requiredRides - currentRides);

  return {
    nextLevel: nextLevel.level,
    requiredRides: requiredRides,
    additionalRidesNeeded: additionalRidesNeeded,
    ratio: nextLevel.ratio,
    multiplier: nextLevel.multiplier,
    message: `Need ${additionalRidesNeeded} more rides for Surge Level ${nextLevel.level} (${nextLevel.ratio})`,
  };
};

// Helper function for no surge response
const getNoSurgeResponse = (rideCount, driverCount, ratio, reason) => {
  return {
    isSurge: false,
    surgeMultiplier: 1.0,
    surgeLevel: 0,
    message: `Normal pricing: ${rideCount} rides, ${driverCount} drivers available - ${reason}`,
    rideCount,
    driverCount,
    rideToDriverRatio: parseFloat(ratio.toFixed(2)),
    requiredRidesForNextLevel: null,
  };
};

// Function to update existing rides with new surge pricing
export const updateExistingRidesSurgePricing = async (
  pickupCoordinates,
  carType,
  surgeMultiplier,
  surgeLevel,
) => {
  try {
    const radiusMeters = 5 * 1000; // 5km in meters

    // Find all requested rides in the area that need surge update using $geoWithin
    const existingRides = await RideModel.find({
      'pickupLocation.coordinates': {
        $geoWithin: {
          $centerSphere: [pickupCoordinates, radiusMeters / 6378100], // Convert meters to radians
        },
      },
      status: 'REQUESTED',
      carType: carType,
    }).populate('passengerId');

    console.log(existingRides);

    if (existingRides.length === 0) {
      console.log(
        `No existing rides need surge update for level ${surgeLevel}`,
      );
      return;
    }

    console.log(
      `🔄 Updating surge pricing for ${existingRides.length} existing rides to level ${surgeLevel}`,
    );

    // Update each ride with new surge pricing
    for (const ride of existingRides) {
      try {
        // Recalculate fare with new surge multiplier
        const recalculatedFare = await recalculateRideFareWithSurge(
          ride,
          surgeMultiplier,
        );

        // Update the ride
        await RideModel.findByIdAndUpdate(ride._id, {
          surgeMultiplier: surgeMultiplier,
          isSurgeApplied: true,
          surgeLevel: surgeLevel,
          estimatedFare: recalculatedFare.newFare,
          $set: {
            'fareBreakdown.surgeMultiplier': surgeMultiplier,
            'fareBreakdown.surgeAmount': recalculatedFare.surgeAmount,
            'fareBreakdown.finalAmount': recalculatedFare.newFare,
          },
          $push: {
            fareUpdates: {
              previousFare: ride.estimatedFare,
              newFare: recalculatedFare.newFare,
              surgeMultiplier: surgeMultiplier,
              surgeLevel: surgeLevel,
              updatedAt: new Date(),
              reason: 'Surge level increased',
            },
          },
        });

        console.log(ride);

        // Notify passenger about fare update
        emitToUser(ride.passengerId?.userId, 'ride:surge_applied', {
          success: true,
          objectType: 'fare-update',
          data: {
            rideId: ride._id,
            previousFare: ride.estimatedFare,
            newFare: recalculatedFare.newFare,
            surgeMultiplier: surgeMultiplier,
            surgeLevel: surgeLevel,
            message: `Fare updated due to increased demand in your area`,
          },
          message:
            'Ride fare has been updated due to increased demand in your area',
        });
      } catch (rideError) {
        console.error(`Error updating surge for ride ${ride._id}:`, rideError);
      }
    }

    console.log(
      `✅ Successfully updated surge pricing for ${existingRides.length} rides`,
    );
  } catch (error) {
    console.error('Error updating existing rides surge pricing:', error);
  }
};

const recalculateRideFareWithSurge = async (ride, newSurgeMultiplier) => {
  try {
    const currentFareBreakdown = ride.fareBreakdown || {};
    const totalBeforeSurge =
      currentFareBreakdown.finalAmount || ride.estimatedFare;

    const newBase = currentFareBreakdown.baseFare * newSurgeMultiplier;
    const newFare =
      currentFareBreakdown.finalAmount -
      currentFareBreakdown.baseFare +
      newBase;
    const surgeAmount = newBase - currentFareBreakdown.baseFare;

    return {
      newFare,
      surgeAmount,
      totalBeforeSurge,
    };
  } catch (error) {
    console.error('Error recalculating ride fare:', error);
    // Fallback: simple calculation
    const newFare = ride.estimatedFare * newSurgeMultiplier;
    return {
      newFare: newFare,
      surgeAmount: newFare - ride.estimatedFare,
      totalBeforeSurge: ride.estimatedFare,
    };
  }
};
