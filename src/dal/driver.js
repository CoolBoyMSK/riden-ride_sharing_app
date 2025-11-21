import mongoose, { Error } from 'mongoose';
import DriverModel from '../models/Driver.js';
import UserModel from '../models/User.js';
import UpdateRequestModel from '../models/updateRequest.js';
import DestinationModel from '../models/Destination.js';
import RideModel from '../models/Ride.js';
import DriverWallet from '../models/DriverWallet.js';
import DriverLocation from '../models/DriverLocation.js';
import FareManagement from '../models/fareManagement.js';
import Zone from '../models/Zone.js';
import ParkingQueue from '../models/ParkingQueue.js';
import { DOCUMENT_TYPES } from '../enums/driverEnums.js';
import { findUserById } from './user/index.js';
import { sendDocumentEditRequestApprovalEmail } from '../templates/emails/user/index.js';
import { emitToUser, emitToRide } from '../realtime/socket.js';
import { notifyUser, createAdminNotification } from '../dal/notification.js';
import env from '../config/envConfig.js';
import Queue from 'bull';
import Redis from 'ioredis';

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

  if (!updatedDriver) {
    throw new Error('Driver not found');
  }

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

export const addDriverSuspension = async (driverId, reason, endDate) => {
  const driver = await DriverModel.findByIdAndUpdate(
    driverId,
    {
      $set: {
        status: 'suspended',
        isSuspended: true,
      },
      $push: {
        suspensions: {
          reason,
          start: new Date(),
          end: new Date(endDate),
        },
      },
    },
    { new: true },
  )
    .populate('userId')
    .lean();

  if (driver) {
    const notify = await notifyUser({
      userId: driver.userId?._id,
      title: 'Account Suspended',
      message: `Your account has been suspended till ${endDate}, due to ${reason}.`,
      module: 'support',
      metadata: driver,
      actionLink: '',
    });
    if (!notify) {
      console.log('Failed to send notification');
    }
  }

  return driver;
};

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

export const updateWayBillDocuments = async (driverId, docType, imageUrl) => {
  const driver = await DriverModel.findOneAndUpdate(
    { userId: driverId },
    {
      $set: {
        [`wayBill.${docType}.imageUrl`]: imageUrl,
        [`wayBill.${docType}.status`]: 'issued',
      },
    },
    { new: true, select: `wayBill.${docType}` },
  ).lean();

  if (!driver) {
    throw new Error('Driver not found');
  }

  return driver;
};

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
  let driver = await DriverModel.findById(driverId).session(session);
  if (!driver) throw new Error('Driver not found');

  const userId = driver.userId; // Save userId before deleting driver
  let user = await UserModel.findById(userId).session(session);
  if (!user) throw new Error('Driver not found');

  const driverDeleteResult = await DriverModel.deleteOne({
    _id: driverId,
  }).session(session);
  const userDeleteResult = await UserModel.deleteOne({ _id: userId }).session(
    session,
  );
  if (
    driverDeleteResult.deletedCount === 0 ||
    userDeleteResult.deletedCount === 0
  ) {
    throw new Error('Failed to delete driver');
  }

  return true;
};

export const updateDocumentStatus = async (
  driverId,
  type,
  status,
  options = {},
) => {
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

// Surge Logic
// export const checkSurgePricing = async (
//   pickupCoordinates,
//   carType,
//   includeCurrentRide = false,
// ) => {
//   try {
//     const radiusMeters = 5 * 1000; // 5km in meters

//     // Create a circular boundary for geoWithin query
//     const center = {
//       type: 'Point',
//       coordinates: pickupCoordinates,
//     };

//     // Get active rides in 5km radius using $geoWithin
//     const activeRidesCount = await RideModel.countDocuments({
//       'pickupLocation.coordinates': {
//         $geoWithin: {
//           $centerSphere: [pickupCoordinates, radiusMeters / 6378100], // Convert meters to radians (Earth radius ~6378100m)
//         },
//       },
//       status: 'REQUESTED',
//       createdAt: {
//         $gte: new Date(Date.now() - 10 * 60 * 1000), // Last 10 minutes
//       },
//     });

//     // Calculate effective ride count (include current ride if specified)
//     const effectiveRideCount = includeCurrentRide
//       ? activeRidesCount + 1
//       : activeRidesCount;

//     // Get available drivers in 5km radius using $geoWithin
//     const availableDriversCount = await DriverLocation.countDocuments({
//       'location.coordinates': {
//         $geoWithin: {
//           $centerSphere: [pickupCoordinates, radiusMeters / 6378100], // Convert meters to radians
//         },
//       },
//       status: 'online',
//       isAvailable: true,
//       currentRideId: { $in: [null, undefined] },
//     });

//     console.log(
//       `📊 Surge Analysis: ${effectiveRideCount} rides (${activeRidesCount} existing + ${includeCurrentRide ? 1 : 0} current), ${availableDriversCount} drivers in 5km radius`,
//     );

//     // Calculate ride-to-driver ratio
//     const rideToDriverRatio =
//       availableDriversCount > 0
//         ? effectiveRideCount / availableDriversCount
//         : Infinity;

//     console.log(
//       `📐 Calculated ratio: ${rideToDriverRatio.toFixed(2)}:1 (${effectiveRideCount}/${availableDriversCount})`,
//     );

//     // Get surge configuration from FareManagement database
//     const fareConfig = await FareManagement.findOne({ carType });
//     if (!fareConfig) {
//       console.log(`No fare configuration found for car type: ${carType}`);
//       return getNoSurgeResponse(
//         effectiveRideCount,
//         availableDriversCount,
//         rideToDriverRatio,
//         'No fare configuration found',
//         includeCurrentRide,
//       );
//     }

//     // Get current day for fare calculation
//     const now = new Date();
//     const currentDay = now.toLocaleString('en-US', { weekday: 'long' });

//     // Find today's fare configuration
//     const todayFare = fareConfig.dailyFares.find(
//       (fare) => fare.day === currentDay,
//     );
//     if (!todayFare) {
//       console.log(`❌ No fare configuration found for day: ${currentDay}`);
//       return getNoSurgeResponse(
//         effectiveRideCount,
//         availableDriversCount,
//         rideToDriverRatio,
//         'No fare configuration for today',
//         includeCurrentRide,
//       );
//     }

//     // Check if surge configuration exists
//     if (!todayFare.surge || todayFare.surge.length === 0) {
//       console.log(
//         `❌ No surge configuration found for ${carType} on ${currentDay}`,
//       );
//       return getNoSurgeResponse(
//         effectiveRideCount,
//         availableDriversCount,
//         rideToDriverRatio,
//         'No surge configuration available',
//         includeCurrentRide,
//       );
//     }

//     console.log(
//       `⚙️ Loaded ${todayFare.surge.length} surge levels from database:`,
//     );
//     todayFare.surge.forEach((level) => {
//       console.log(
//         `   - Level ${level.level}: ${level.ratio} = ${level.multiplier}x`,
//       );
//     });

//     // Apply surge logic based on database configuration
//     const surgeResult = calculateSurgeFromDB(
//       effectiveRideCount,
//       availableDriversCount,
//       rideToDriverRatio,
//       todayFare.surge,
//     );

//     // Prepare response
//     const response = {
//       isSurge: surgeResult.isSurge,
//       surgeMultiplier: surgeResult.surgeMultiplier,
//       surgeLevel: surgeResult.surgeLevel,
//       message: surgeResult.message,
//       rideCount: effectiveRideCount,
//       existingRideCount: activeRidesCount,
//       driverCount: availableDriversCount,
//       rideToDriverRatio: parseFloat(rideToDriverRatio.toFixed(2)),
//       requiredRidesForNextLevel: surgeResult.requiredRidesForNextLevel,
//       includesCurrentRide: includeCurrentRide,
//       surgeConfig: {
//         carType,
//         day: currentDay,
//         configuredLevels: todayFare.surge.length,
//       },
//     };

//     return response;
//   } catch (error) {
//     console.error('Error checking surge pricing:', error);
//     return getNoSurgeResponse(
//       0,
//       0,
//       0,
//       'Error checking surge pricing',
//       includeCurrentRide,
//     );
//   }
// };

// // Helper function to calculate surge from database configuration
// const calculateSurgeFromDB = (
//   activeRidesCount,
//   availableDriversCount,
//   rideToDriverRatio,
//   surgeConfig,
// ) => {
//   // Sort surge levels by ratio (ascending order) - lowest ratio first
//   const sortedLevels = surgeConfig
//     .filter((level) => level.level && level.ratio && level.multiplier)
//     .sort((a, b) => {
//       const ratioA = parseFloat(a.ratio.split(':')[0]);
//       const ratioB = parseFloat(b.ratio.split(':')[0]);
//       return ratioA - ratioB;
//     });

//   if (sortedLevels.length === 0) {
//     return {
//       isSurge: false,
//       surgeMultiplier: 1.0,
//       surgeLevel: 0,
//       message: `No surge levels configured. ${activeRidesCount} rides, ${availableDriversCount} drivers available`,
//       requiredRidesForNextLevel: null,
//     };
//   }

//   let highestQualifyingLevel = null;

//   console.log(`🔍 Checking surge levels from lowest to highest:`);

//   // Find all qualifying levels
//   for (let i = 0; i < sortedLevels.length; i++) {
//     const level = sortedLevels[i];
//     const requiredRatio = parseFloat(level.ratio.split(':')[0]);

//     console.log(
//       `   Level ${level.level}: requires ${requiredRatio}:1 ratio, current ratio: ${rideToDriverRatio.toFixed(2)}:1`,
//     );

//     if (rideToDriverRatio >= requiredRatio) {
//       // This level qualifies
//       console.log(
//         `   ✅ Level ${level.level} qualifies (${level.multiplier}x)`,
//       );

//       // Keep track of the highest qualifying level
//       if (
//         !highestQualifyingLevel ||
//         level.level > highestQualifyingLevel.level
//       ) {
//         highestQualifyingLevel = level;
//       }
//     } else {
//       console.log(`   ❌ Level ${level.level} does not qualify`);
//     }
//   }

//   // Apply the highest qualifying level found
//   const isSurge = highestQualifyingLevel !== null;
//   const surgeMultiplier = isSurge ? highestQualifyingLevel.multiplier : 1.0;
//   const surgeLevel = isSurge ? highestQualifyingLevel.level : 0;

//   // Prepare message and next level requirements
//   let message;
//   if (isSurge) {
//     message = `🚨 SURGE LEVEL ${surgeLevel} (${highestQualifyingLevel.ratio})! ${activeRidesCount} rides waiting, ${availableDriversCount} drivers available (${rideToDriverRatio.toFixed(1)}:1 ratio)`;
//   } else {
//     message = `Normal pricing: ${activeRidesCount} rides, ${availableDriversCount} drivers available (${rideToDriverRatio.toFixed(1)}:1 ratio)`;
//   }

//   console.log(
//     `🎯 Final applied surge level: ${surgeLevel}, multiplier: ${surgeMultiplier}x`,
//   );

//   const requiredRidesForNextLevel = getNextSurgeLevelRequirementFromDB(
//     surgeLevel,
//     activeRidesCount,
//     availableDriversCount,
//     sortedLevels,
//   );

//   return {
//     isSurge,
//     surgeMultiplier,
//     surgeLevel,
//     message,
//     requiredRidesForNextLevel,
//   };
// };

// // Helper function to get next surge level requirements from DB config
// const getNextSurgeLevelRequirementFromDB = (
//   currentLevel,
//   currentRides,
//   currentDrivers,
//   surgeLevels,
// ) => {
//   if (currentDrivers === 0) {
//     return {
//       nextLevel: null,
//       message: 'No drivers available for surge calculation',
//     };
//   }

//   // Find the next surge level
//   const nextLevel = surgeLevels.find((level) => level.level > currentLevel);

//   if (!nextLevel) {
//     return {
//       nextLevel: null,
//       message: 'Maximum surge level reached',
//     };
//   }

//   const requiredRatio = parseFloat(nextLevel.ratio.split(':')[0]);
//   const requiredRides = Math.ceil(currentDrivers * requiredRatio);
//   const additionalRidesNeeded = Math.max(0, requiredRides - currentRides);

//   return {
//     nextLevel: nextLevel.level,
//     requiredRides: requiredRides,
//     additionalRidesNeeded: additionalRidesNeeded,
//     ratio: nextLevel.ratio,
//     multiplier: nextLevel.multiplier,
//     message: `Need ${additionalRidesNeeded} more rides for Surge Level ${nextLevel.level} (${nextLevel.ratio})`,
//   };
// };

// // Helper function for no surge response
// const getNoSurgeResponse = (rideCount, driverCount, ratio, reason) => {
//   return {
//     isSurge: false,
//     surgeMultiplier: 1.0,
//     surgeLevel: 0,
//     message: `Normal pricing: ${rideCount} rides, ${driverCount} drivers available - ${reason}`,
//     rideCount,
//     driverCount,
//     rideToDriverRatio: parseFloat(ratio.toFixed(2)),
//     requiredRidesForNextLevel: null,
//   };
// };

// // Function to update existing rides with new surge pricing
// export const updateExistingRidesSurgePricing = async (
//   pickupCoordinates,
//   carType,
//   surgeMultiplier,
//   surgeLevel,
// ) => {
//   try {
//     const radiusMeters = 5 * 1000; // 5km in meters

//     // Find all requested rides in the area that need surge update using $geoWithin
//     const existingRides = await RideModel.find({
//       'pickupLocation.coordinates': {
//         $geoWithin: {
//           $centerSphere: [pickupCoordinates, radiusMeters / 6378100], // Convert meters to radians
//         },
//       },
//       status: 'REQUESTED',
//       carType: carType,
//     }).populate('passengerId');

//     console.log(existingRides);

//     if (existingRides.length === 0) {
//       console.log(
//         `No existing rides need surge update for level ${surgeLevel}`,
//       );
//       return;
//     }

//     console.log(
//       `🔄 Updating surge pricing for ${existingRides.length} existing rides to level ${surgeLevel}`,
//     );

//     // Update each ride with new surge pricing
//     for (const ride of existingRides) {
//       try {
//         // Recalculate fare with new surge multiplier
//         const recalculatedFare = await recalculateRideFareWithSurge(
//           ride,
//           surgeMultiplier,
//         );

//         // Update the ride
//         await RideModel.findByIdAndUpdate(ride._id, {
//           surgeMultiplier: surgeMultiplier,
//           isSurgeApplied: true,
//           surgeLevel: surgeLevel,
//           estimatedFare: recalculatedFare.newFare,
//           $set: {
//             'fareBreakdown.surgeMultiplier': surgeMultiplier,
//             'fareBreakdown.surgeAmount': recalculatedFare.surgeAmount,
//             'fareBreakdown.finalAmount': recalculatedFare.newFare,
//           },
//           $push: {
//             fareUpdates: {
//               previousFare: ride.estimatedFare,
//               newFare: recalculatedFare.newFare,
//               surgeMultiplier: surgeMultiplier,
//               surgeLevel: surgeLevel,
//               updatedAt: new Date(),
//               reason: 'Surge level increased',
//             },
//           },
//         });

//         console.log(ride);

//         // Notify passenger about fare update
//         emitToUser(ride.passengerId?.userId, 'ride:surge_applied', {
//           success: true,
//           objectType: 'fare-update',
//           data: {
//             rideId: ride._id,
//             previousFare: ride.estimatedFare,
//             newFare: recalculatedFare.newFare,
//             surgeMultiplier: surgeMultiplier,
//             surgeLevel: surgeLevel,
//             message: `Fare updated due to increased demand in your area`,
//           },
//           message:
//             'Ride fare has been updated due to increased demand in your area',
//         });
//       } catch (rideError) {
//         console.error(`Error updating surge for ride ${ride._id}:`, rideError);
//       }
//     }

//     console.log(
//       `✅ Successfully updated surge pricing for ${existingRides.length} rides`,
//     );
//   } catch (error) {
//     console.error('Error updating existing rides surge pricing:', error);
//   }
// };

// const recalculateRideFareWithSurge = async (ride, newSurgeMultiplier) => {
//   try {
//     const currentFareBreakdown = ride.fareBreakdown || {};
//     const totalBeforeSurge =
//       currentFareBreakdown.finalAmount || ride.estimatedFare;

//     const newBase = currentFareBreakdown.baseFare * newSurgeMultiplier;
//     const newFare =
//       currentFareBreakdown.finalAmount -
//       currentFareBreakdown.baseFare +
//       newBase;
//     const surgeAmount = newBase - currentFareBreakdown.baseFare;

//     return {
//       newFare,
//       surgeAmount,
//       totalBeforeSurge,
//     };
//   } catch (error) {
//     console.error('Error recalculating ride fare:', error);
//     // Fallback: simple calculation
//     const newFare = ride.estimatedFare * newSurgeMultiplier;
//     return {
//       newFare: newFare,
//       surgeAmount: newFare - ride.estimatedFare,
//       totalBeforeSurge: ride.estimatedFare,
//     };
//   }
// };

// Fixed Surge Logic

export const analyzeSurgePricing = async (pickupCoordinates, carType) => {
  try {
    const radiusMeters = 5 * 1000;

    // Single database call for active rides count
    const activeRidesCount = await RideModel.countDocuments({
      'pickupLocation.coordinates': {
        $geoWithin: {
          $centerSphere: [pickupCoordinates, radiusMeters / 6378100],
        },
      },
      status: 'REQUESTED',
      createdAt: {
        $gte: new Date(Date.now() - 10 * 60 * 1000),
      },
    });

    // Single database call for available drivers count
    const availableDriversCount = await DriverLocation.countDocuments({
      'location.coordinates': {
        $geoWithin: {
          $centerSphere: [pickupCoordinates, radiusMeters / 6378100],
        },
      },
      status: 'online',
      isAvailable: true,
      currentRideId: { $in: [null, undefined] },
    });

    // Single database call for fare configuration
    const fareConfig = await findFareConfigurationForLocation(
      pickupCoordinates,
      carType,
    );

    if (!fareConfig) {
      const noSurgeResponse = getNoSurgeResponse(
        activeRidesCount,
        availableDriversCount,
        0,
        'No fare configuration found',
        false,
      );
      return createComparisonResult(noSurgeResponse, noSurgeResponse, false);
    }

    const carTypeFare = fareConfig.dailyFares.find(
      (fare) => fare.carType === carType,
    );

    if (!carTypeFare || !carTypeFare.surge || carTypeFare.surge.length === 0) {
      const noSurgeResponse = getNoSurgeResponse(
        activeRidesCount,
        availableDriversCount,
        0,
        'No surge configuration available',
        false,
      );
      return createComparisonResult(noSurgeResponse, noSurgeResponse, false);
    }

    // Calculate both scenarios without additional DB calls
    const withoutCurrentRide = calculateSurgeScenario(
      activeRidesCount,
      availableDriversCount,
      carTypeFare.surge,
      false,
    );

    const withCurrentRide = calculateSurgeScenario(
      activeRidesCount + 1, // Include current ride
      availableDriversCount,
      carTypeFare.surge,
      true,
    );

    // Determine if we need to update existing rides
    const shouldUpdateExistingRides =
      (!withoutCurrentRide.isSurge && withCurrentRide.isSurge) || // New surge activated
      (withCurrentRide.isSurge &&
        withoutCurrentRide.isSurge &&
        withCurrentRide.surgeLevel > withoutCurrentRide.surgeLevel); // Surge level increased

    const result = createComparisonResult(
      withCurrentRide,
      withoutCurrentRide,
      shouldUpdateExistingRides,
      fareConfig,
    );

    // Performance logging
    console.log(`🎯 Surge Analysis Complete:
      - Rides: ${activeRidesCount} existing → ${activeRidesCount + 1} with current
      - Drivers: ${availableDriversCount}
      - Surge: ${withoutCurrentRide.isSurge ? 'Active' : 'Inactive'} → ${withCurrentRide.isSurge ? 'Active' : 'Inactive'}
      - Level: ${withoutCurrentRide.surgeLevel} → ${withCurrentRide.surgeLevel}
      - Update Required: ${shouldUpdateExistingRides ? 'YES' : 'NO'}`);

    return result;
  } catch (error) {
    console.error('Error in surge pricing analysis:', error);
    const errorResponse = getNoSurgeResponse(
      0,
      0,
      0,
      `Analysis error: ${error.message}`,
      false,
    );
    return createComparisonResult(errorResponse, errorResponse, false);
  }
};

// export const checkSurgePricing = async (
//   pickupCoordinates,
//   carType,
//   includeCurrentRide = false,
// ) => {
//   try {
//     const radiusMeters = 5 * 1000; // 5km in meters

//     // Get active rides in 5km radius using $geoWithin
//     const activeRidesCount = await RideModel.countDocuments({
//       'pickupLocation.coordinates': {
//         $geoWithin: {
//           $centerSphere: [pickupCoordinates, radiusMeters / 6378100],
//         },
//       },
//       status: 'REQUESTED',
//       createdAt: {
//         $gte: new Date(Date.now() - 10 * 60 * 1000), // Last 10 minutes
//       },
//     });

//     // Calculate effective ride count
//     const effectiveRideCount = includeCurrentRide
//       ? activeRidesCount + 1
//       : activeRidesCount;

//     // Get available drivers in 5km radius
//     const availableDriversCount = await DriverLocation.countDocuments({
//       'location.coordinates': {
//         $geoWithin: {
//           $centerSphere: [pickupCoordinates, radiusMeters / 6378100],
//         },
//       },
//       status: 'online',
//       isAvailable: true,
//       currentRideId: { $in: [null, undefined] },
//     });

//     console.log(
//       `Surge Analysis: ${effectiveRideCount} rides (${activeRidesCount} existing + ${includeCurrentRide ? 1 : 0} current), ${availableDriversCount} drivers in 5km radius`,
//     );

//     // Calculate ride-to-driver ratio
//     const rideToDriverRatio =
//       availableDriversCount > 0
//         ? effectiveRideCount / availableDriversCount
//         : 0;

//     console.log(
//       `Calculated ratio: ${rideToDriverRatio.toFixed(2)}:1 (${effectiveRideCount}/${availableDriversCount})`,
//     );

//     // Find the appropriate fare configuration (zone-based or default)
//     const fareConfig = await findFareConfigurationForLocation(
//       pickupCoordinates,
//       carType,
//     );
//     if (!fareConfig) {
//       console.log(
//         `No fare configuration found for location and car type: ${carType}`,
//       );
//       return getNoSurgeResponse(
//         effectiveRideCount,
//         availableDriversCount,
//         rideToDriverRatio,
//         'No fare configuration found for this location',
//         includeCurrentRide,
//       );
//     }

//     // Find the car type configuration within dailyFares
//     const carTypeFare = fareConfig.dailyFares.find(
//       (fare) => fare.carType === carType,
//     );
//     if (!carTypeFare) {
//       console.log(`No fare configuration found for car type: ${carType}`);
//       return getNoSurgeResponse(
//         effectiveRideCount,
//         availableDriversCount,
//         rideToDriverRatio,
//         `No fare configuration for car type: ${carType}`,
//         includeCurrentRide,
//       );
//     }

//     // Check if surge configuration exists
//     if (!carTypeFare.surge || carTypeFare.surge.length === 0) {
//       console.log(`No surge configuration found for ${carType}`);
//       return getNoSurgeResponse(
//         effectiveRideCount,
//         availableDriversCount,
//         rideToDriverRatio,
//         'No surge configuration available',
//         includeCurrentRide,
//       );
//     }

//     console.log(
//       `Loaded ${carTypeFare.surge.length} surge levels for ${carType}:`,
//     );
//     carTypeFare.surge.forEach((level) => {
//       console.log(
//         `Level ${level.level}: ${level.ratio} = ${level.multiplier}x`,
//       );
//     });

//     // Apply surge logic based on database configuration
//     const surgeResult = calculateSurgeFromDB(
//       effectiveRideCount,
//       availableDriversCount,
//       rideToDriverRatio,
//       carTypeFare.surge,
//     );

//     // Prepare response
//     const response = {
//       isSurge: surgeResult.isSurge,
//       surgeMultiplier: surgeResult.surgeMultiplier,
//       surgeLevel: surgeResult.surgeLevel,
//       message: surgeResult.message,
//       rideCount: effectiveRideCount,
//       existingRideCount: activeRidesCount,
//       driverCount: availableDriversCount,
//       rideToDriverRatio: parseFloat(rideToDriverRatio.toFixed(2)),
//       requiredRidesForNextLevel: surgeResult.requiredRidesForNextLevel,
//       includesCurrentRide: includeCurrentRide,
//       fareConfigType: fareConfig.zone ? 'zone' : 'default',
//       zoneName: fareConfig.zone?.name || 'default',
//       surgeConfig: {
//         carType,
//         configuredLevels: carTypeFare.surge.length,
//       },
//     };

//     return response;
//   } catch (error) {
//     console.error('Error checking surge pricing:', error);
//     return getNoSurgeResponse(
//       0,
//       0,
//       0,
//       `Error checking surge pricing: ${error.message}`,
//       includeCurrentRide,
//     );
//   }
// };

export const findFareConfigurationForLocation = async (
  pickupCoordinates,
  carType,
) => {
  try {
    // First, try to find a zone-based fare configuration
    const zoneFareConfig = await FareManagement.findOne({
      'zone.boundaries': {
        $geoIntersects: {
          $geometry: {
            type: 'Point',
            coordinates: pickupCoordinates,
          },
        },
      },
      'zone.isActive': true,
      'dailyFares.carType': carType,
    });

    if (zoneFareConfig) {
      console.log(
        `Using zone-based fare configuration: ${zoneFareConfig.zone?.name}`,
      );
      return zoneFareConfig;
    }

    // If no zone found, use default fare configuration
    const defaultFareConfig = await FareManagement.findOne({
      isDefault: true,
      'dailyFares.carType': carType,
    });

    if (defaultFareConfig) {
      console.log(`Using default fare configuration`);
      return defaultFareConfig;
    }

    console.log(
      `No fare configuration found for location and car type: ${carType}`,
    );
    return null;
  } catch (error) {
    console.error('Error finding fare configuration:', error);
    // Fallback to default configuration
    return await FareManagement.findOne({
      isDefault: true,
      'dailyFares.carType': carType,
    });
  }
};

// const calculateSurgeFromDB = (
//   activeRidesCount,
//   availableDriversCount,
//   rideToDriverRatio,
//   surgeConfig,
// ) => {
//   // Sort surge levels by ratio (ascending order) - lowest ratio first
//   const sortedLevels = surgeConfig
//     .filter((level) => level.level && level.ratio && level.multiplier)
//     .sort((a, b) => {
//       const ratioA = parseFloat(a.ratio.split(':')[0]);
//       const ratioB = parseFloat(b.ratio.split(':')[0]);
//       return ratioA - ratioB;
//     });

//   if (sortedLevels.length === 0) {
//     return {
//       isSurge: false,
//       surgeMultiplier: 1.0,
//       surgeLevel: 0,
//       message: `No surge levels configured. ${activeRidesCount} rides, ${availableDriversCount} drivers available`,
//       requiredRidesForNextLevel: null,
//     };
//   }

//   let highestQualifyingLevel = null;

//   console.log(`Checking surge levels from lowest to highest:`);

//   // Find all qualifying levels
//   for (let i = 0; i < sortedLevels.length; i++) {
//     const level = sortedLevels[i];
//     const requiredRatio = parseFloat(level.ratio.split(':')[0]);

//     console.log(
//       `Level ${level.level}: requires ${requiredRatio}:1 ratio, current ratio: ${rideToDriverRatio.toFixed(2)}:1`,
//     );

//     if (rideToDriverRatio >= requiredRatio) {
//       console.log(`Level ${level.level} qualifies (${level.multiplier}x)`);

//       if (
//         !highestQualifyingLevel ||
//         level.level > highestQualifyingLevel.level
//       ) {
//         highestQualifyingLevel = level;
//       }
//     } else {
//       console.log(`Level ${level.level} does not qualify`);
//     }
//   }

//   // Apply the highest qualifying level found
//   const isSurge = highestQualifyingLevel !== null;
//   const surgeMultiplier = isSurge ? highestQualifyingLevel.multiplier : 1.0;
//   const surgeLevel = isSurge ? highestQualifyingLevel.level : 0;

//   // Prepare message and next level requirements
//   let message;
//   if (isSurge) {
//     message = `SURGE LEVEL ${surgeLevel} (${highestQualifyingLevel.ratio})! ${activeRidesCount} rides waiting, ${availableDriversCount} drivers available (${rideToDriverRatio.toFixed(1)}:1 ratio)`;
//   } else {
//     message = `Normal pricing: ${activeRidesCount} rides, ${availableDriversCount} drivers available (${rideToDriverRatio.toFixed(1)}:1 ratio)`;
//   }

//   console.log(
//     `Final applied surge level: ${surgeLevel}, multiplier: ${surgeMultiplier}x`,
//   );

//   const requiredRidesForNextLevel = getNextSurgeLevelRequirementFromDB(
//     surgeLevel,
//     activeRidesCount,
//     availableDriversCount,
//     sortedLevels,
//   );

//   return {
//     isSurge,
//     surgeMultiplier,
//     surgeLevel,
//     message,
//     requiredRidesForNextLevel,
//   };
// };

// const getNextSurgeLevelRequirementFromDB = (
//   currentLevel,
//   currentRides,
//   currentDrivers,
//   surgeLevels,
// ) => {
//   if (currentDrivers === 0) {
//     return {
//       nextLevel: null,
//       message: 'No drivers available for surge calculation',
//     };
//   }

//   // Find the next surge level
//   const nextLevel = surgeLevels.find((level) => level.level > currentLevel);

//   if (!nextLevel) {
//     return {
//       nextLevel: null,
//       message: 'Maximum surge level reached',
//     };
//   }

//   const requiredRatio = parseFloat(nextLevel.ratio.split(':')[0]);
//   const requiredRides = Math.ceil(currentDrivers * requiredRatio);
//   const additionalRidesNeeded = Math.max(0, requiredRides - currentRides);

//   return {
//     nextLevel: nextLevel.level,
//     requiredRides: requiredRides,
//     additionalRidesNeeded: additionalRidesNeeded,
//     ratio: nextLevel.ratio,
//     multiplier: nextLevel.multiplier,
//     message: `Need ${additionalRidesNeeded} more rides for Surge Level ${nextLevel.level} (${nextLevel.ratio})`,
//   };
// };

const calculateSurgeScenario = (
  rideCount,
  driverCount,
  surgeConfig,
  includesCurrentRide,
) => {
  const rideToDriverRatio = driverCount > 0 ? rideCount / driverCount : 0;

  const sortedLevels = surgeConfig
    .filter((level) => level.level && level.ratio && level.multiplier)
    .sort((a, b) => {
      const ratioA = parseFloat(a.ratio.split(':')[0]);
      const ratioB = parseFloat(b.ratio.split(':')[0]);
      return ratioA - ratioB;
    });

  let highestQualifyingLevel = null;

  for (const level of sortedLevels) {
    const requiredRatio = parseFloat(level.ratio.split(':')[0]);
    if (rideToDriverRatio >= requiredRatio) {
      if (
        !highestQualifyingLevel ||
        level.level > highestQualifyingLevel.level
      ) {
        highestQualifyingLevel = level;
      }
    }
  }

  const isSurge = highestQualifyingLevel !== null;
  const surgeMultiplier = isSurge ? highestQualifyingLevel.multiplier : 1.0;
  const surgeLevel = isSurge ? highestQualifyingLevel.level : 0;

  const message = isSurge
    ? `SURGE LEVEL ${surgeLevel} (${highestQualifyingLevel.ratio})! ${rideCount} rides, ${driverCount} drivers (${rideToDriverRatio.toFixed(1)}:1)`
    : `Normal pricing: ${rideCount} rides, ${driverCount} drivers (${rideToDriverRatio.toFixed(1)}:1)`;

  return {
    isSurge,
    surgeMultiplier,
    surgeLevel,
    message,
    rideCount,
    driverCount,
    rideToDriverRatio: parseFloat(rideToDriverRatio.toFixed(2)),
    includesCurrentRide,
    requiredRidesForNextLevel: isSurge
      ? getNextLevelRequirements(
          surgeLevel,
          rideCount,
          driverCount,
          sortedLevels,
        )
      : null,
  };
};

const createComparisonResult = (
  withCurrentRide,
  withoutCurrentRide,
  shouldUpdate,
  fareConfig = null,
) => ({
  surgeDataWithCurrentRide: withCurrentRide,
  currentSurgeData: withoutCurrentRide,
  shouldUpdateExistingRides: shouldUpdate,
  surgeMultiplier: withCurrentRide.surgeMultiplier,
  isSurgeApplied: withCurrentRide.isSurge,
  fareConfigType: fareConfig?.zone ? 'zone' : 'default',
  zoneName: fareConfig?.zone?.name || 'default',
  analysisTimestamp: new Date().toISOString(),
});

const getNextLevelRequirements = (
  currentLevel,
  currentRides,
  currentDrivers,
  surgeLevels,
) => {
  if (currentDrivers === 0) return null;

  const nextLevel = surgeLevels.find((level) => level.level > currentLevel);
  if (!nextLevel) return null;

  const requiredRatio = parseFloat(nextLevel.ratio.split(':')[0]);
  const requiredRides = Math.ceil(currentDrivers * requiredRatio);
  const additionalRidesNeeded = Math.max(0, requiredRides - currentRides);

  return {
    nextLevel: nextLevel.level,
    requiredRides,
    additionalRidesNeeded,
    ratio: nextLevel.ratio,
    multiplier: nextLevel.multiplier,
    message: `Need ${additionalRidesNeeded} more rides for Surge Level ${nextLevel.level}`,
  };
};

const getNoSurgeResponse = (
  rideCount,
  driverCount,
  ratio,
  reason,
  includeCurrentRide,
) => {
  return {
    isSurge: false,
    surgeMultiplier: 1.0,
    surgeLevel: 0,
    message: `Normal pricing: ${rideCount} rides, ${driverCount} drivers available - ${reason}`,
    rideCount,
    driverCount,
    rideToDriverRatio: parseFloat(ratio.toFixed(2)),
    requiredRidesForNextLevel: null,
    includesCurrentRide: includeCurrentRide,
  };
};

export const updateExistingRidesSurgePricing = async (
  pickupCoordinates,
  carType,
  surgeMultiplier,
  surgeLevel,
) => {
  try {
    const radiusMeters = 5 * 1000; // 5km in meters

    // Find all requested rides in the area that need surge update
    const existingRides = await RideModel.find({
      'pickupLocation.coordinates': {
        $geoWithin: {
          $centerSphere: [pickupCoordinates, radiusMeters / 6378100],
        },
      },
      status: 'REQUESTED',
      carType: carType,
      surgeLevel: { $lt: surgeLevel }, // Only update rides with lower surge level
    }).populate('passengerId');

    if (existingRides.length === 0) {
      console.log(
        `No existing rides need surge update for level ${surgeLevel}`,
      );
      return;
    }

    console.log(
      `Updating surge pricing for ${existingRides.length} existing rides to level ${surgeLevel}`,
    );

    // Update each ride with new surge pricing
    const updatePromises = existingRides.map(async (ride) => {
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

        // Notify passenger about fare update
        if (ride.passengerId?.userId) {
          emitToUser(ride.passengerId.userId, 'ride:surge_applied', {
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
        }
      } catch (rideError) {
        console.error(`Error updating surge for ride ${ride._id}:`, rideError);
        throw rideError; // Re-throw to handle in Promise.allSettled
      }
    });

    // Wait for all updates to complete
    const results = await Promise.allSettled(updatePromises);

    const successfulUpdates = results.filter(
      (result) => result.status === 'fulfilled',
    ).length;
    const failedUpdates = results.filter(
      (result) => result.status === 'rejected',
    ).length;

    console.log(
      `Successfully updated surge pricing for ${successfulUpdates} rides, ${failedUpdates} failed`,
    );
  } catch (error) {
    console.error('Error updating existing rides surge pricing:', error);
    throw error;
  }
};

const recalculateRideFareWithSurge = async (ride, newSurgeMultiplier) => {
  try {
    const currentFareBreakdown = ride.fareBreakdown || {};

    // Ensure we have the necessary fare breakdown components
    if (!currentFareBreakdown.baseFare) {
      throw new Error('Missing base fare in fare breakdown');
    }

    const totalBeforeSurge =
      currentFareBreakdown.finalAmount || ride.estimatedFare;

    // Calculate new base fare with surge
    const newBase = currentFareBreakdown.baseFare * newSurgeMultiplier;
    const newFare = totalBeforeSurge - currentFareBreakdown.baseFare + newBase;
    const surgeAmount = newBase - currentFareBreakdown.baseFare;

    return {
      newFare: Math.max(0, newFare), // Ensure non-negative
      surgeAmount: Math.max(0, surgeAmount),
      totalBeforeSurge,
    };
  } catch (error) {
    console.error('Error recalculating ride fare:', error);
    // Fallback: simple calculation with validation
    const currentFare = ride.estimatedFare || 0;
    const newFare = Math.max(0, currentFare * newSurgeMultiplier);
    return {
      newFare: newFare,
      surgeAmount: Math.max(0, newFare - currentFare),
      totalBeforeSurge: currentFare,
    };
  }
};

export const isAirportRide = async (pickupCoordinates) => {
  const zone = await Zone.findOne({
    type: 'airport',
    boundaries: {
      $geoIntersects: {
        $geometry: {
          type: 'Point',
          coordinates: pickupCoordinates,
        },
      },
    },
    isActive: true,
  });

  if (zone) {
    return zone;
  } else {
    return false;
  }
};

// Driver Searching Logic
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
            currentRideId: { $in: [null, undefined, ''] },
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
          user: { $ne: [] },
          'user.0.isBlocked': { $ne: true },
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

    const userIds = result.map((item) => item.userId.toString());
    return userIds;
  } catch (error) {
    console.error('Error finding nearby driver user IDs:', error);
    throw error;
  }
};

const getZoneSearchParameters = async (pickupCoordinates) => {
  try {
    // Find zone for pickup location
    const zone = await Zone.findOne({
      boundaries: {
        $geoIntersects: {
          $geometry: {
            type: 'Point',
            coordinates: pickupCoordinates,
          },
        },
      },
      isActive: true,
    });

    if (zone) {
      console.log(`📍 Using zone-specific parameters: ${zone.name}`);
      return {
        minRadius: zone.minSearchRadius ? zone.minSearchRadius : 5,
        maxRadius: zone.maxSearchRadius ? zone.maxSearchRadius : 10,
        minRadiusTime: zone.minRadiusSearchTime ? zone.minRadiusSearchTime : 2,
        maxRadiusTime: zone.maxRadiusSearchTime ? zone.maxRadiusSearchTime : 3,
        zoneName: zone.name,
        isZoneBased: true,
      };
    } else {
      console.log(`🌍 Using default search parameters`);
      return {
        minRadius: 5, // Default min radius in km
        maxRadius: 10, // Default max radius in km
        minRadiusTime: 2, // Default min radius time in minutes
        maxRadiusTime: 3, // Default max radius time in minutes
        zoneName: 'default',
        isZoneBased: false,
      };
    }
  } catch (error) {
    console.error('Error getting zone search parameters:', error);
    // Fallback to defaults
    return {
      minRadius: 5,
      maxRadius: 10,
      minRadiusTime: 2,
      maxRadiusTime: 3,
      zoneName: 'default',
      isZoneBased: false,
    };
  }
};

// Calculate search iterations based on time and interval
const calculateSearchIterations = (timeInMinutes, intervalInSeconds = 5) => {
  const totalSeconds = timeInMinutes * 60;
  return Math.floor(totalSeconds / intervalInSeconds);
};

const handleRegularRide = async (ride) => {
  try {
    // Get zone-based search parameters
    const searchParams = await getZoneSearchParameters(
      ride.pickupLocation.coordinates,
    );

    // Calculate iterations based on zone configuration
    const phase1Iterations = calculateSearchIterations(
      searchParams.minRadiusTime,
    );
    const phase2Iterations = calculateSearchIterations(
      searchParams.maxRadiusTime,
    );

    // Store ride and search parameters in Redis
    const redisData = {
      ride: JSON.stringify(ride),
      searchParams: JSON.stringify({
        ...searchParams,
        phase1Iterations,
        phase2Iterations,
        startedAt: Date.now(),
      }),
    };

    // Batch Redis operations
    const redisPipeline = redis.pipeline();
    redisPipeline.setex(`ride:${ride._id}`, 300, redisData.ride);
    redisPipeline.setex(
      `ride:${ride._id}:search_params`,
      300,
      redisData.searchParams,
    );
    redisPipeline.setex(`ride:${ride._id}:phase1_searches`, 300, '0');
    redisPipeline.setex(`ride:${ride._id}:phase2_searches`, 300, '0');
    await redisPipeline.exec();

    await startDriverLocationMonitoring(ride._id);

    // Start phase 1 immediately
    await driverSearchQueue.add(
      'search-drivers',
      { rideId: ride._id, phase: 1 },
      {
        delay: 0,
        jobId: `ride-search-${ride._id}-phase1-0`,
        removeOnComplete: true,
        attempts: 1,
      },
    );

    // Calculate total search time based on zone configuration
    const totalSearchTime =
      (searchParams.minRadiusTime + searchParams.maxRadiusTime) * 60 * 1000;

    // Set expiration for auto-cancellation
    await driverSearchQueue.add(
      'cancel-ride',
      { rideId: ride._id },
      {
        delay: totalSearchTime,
        jobId: `ride-cancel-${ride._id}`,
        removeOnComplete: true,
      },
    );

    console.log(`✅ Progressive search started for regular ride ${ride._id}`);
    console.log(`📊 Zone: ${searchParams.zoneName}`);
    console.log(
      `📍 Radii: ${searchParams.minRadius}km → ${searchParams.maxRadius}km`,
    );
    console.log(
      `⏰ Times: ${searchParams.minRadiusTime}min → ${searchParams.maxRadiusTime}min`,
    );
    console.log(`🔄 Iterations: ${phase1Iterations} → ${phase2Iterations}`);
  } catch (error) {
    console.error('Error handling regular ride:', error);
    throw error;
  }
};

const handleAirportRide = async (ride) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Find the nearest airport zone to the ride's pickup location
    const airportZone = ride.airport;
    if (!airportZone) {
      console.log(
        `No airport found near ride ${ride._id}, falling back to regular search`,
      );
      await session.abortTransaction();
      await handleRegularRide(ride);
      return;
    }

    // Find associated parking lot for this airport
    const parkingQueue = await ParkingQueue.findOne({
      airportId: airportZone._id,
      isActive: true,
    }).session(session);

    if (!parkingQueue) {
      console.log(
        `No active parking queue found for airport ${airportZone.name}, falling back to regular search`,
      );
      await session.abortTransaction();
      await handleRegularRide(ride);
      return;
    }

    console.log(
      `Airport ride ${ride._id} assigned to parking lot ${parkingQueue.parkingLotId}`,
    );

    // Add ride to active offers in parking queue
    const expiresAt = new Date(Date.now() + 300000); // 10 seconds from now

    const updatedQueue = await ParkingQueue.findOneAndUpdate(
      {
        _id: parkingQueue._id,
        'activeOffers.rideId': { $ne: ride._id }, // Prevent duplicates
      },
      {
        $push: {
          activeOffers: {
            rideId: ride._id,
            offeredAt: new Date(),
            expiresAt: expiresAt,
          },
        },
      },
      { new: true, session },
    );

    if (!updatedQueue) {
      throw new Error('Failed to add ride to parking queue active offers');
    }

    // Start offering to the first driver in queue
    await offerRideToNextDriver(parkingQueue._id, ride._id, session);

    await session.commitTransaction();

    console.log(
      `✅ Airport ride ${ride._id} added to parking queue ${parkingQueue.parkingLotId}`,
    );
    console.log(`🔄 Will be offered to drivers in queue for 10 seconds each`);

    // Set timeout for auto-cancellation (30 minutes for airport rides)
    await driverSearchQueue.add(
      'cancel-ride',
      { rideId: ride._id },
      {
        delay: 30 * 60 * 1000, // 30 minutes
        jobId: `ride-cancel-${ride._id}`,
        removeOnComplete: true,
      },
    );
  } catch (error) {
    await session.abortTransaction();
    console.error('Error handling airport ride:', error);
    // Fallback to regular search
    await handleRegularRide(ride);
  }
};

export const offerRideToNextDriver = async (
  parkingQueueId,
  rideId,
  session = null,
) => {
  const useSession = session || (await mongoose.startSession());
  if (!session) useSession.startTransaction();

  console.log('Offering Ride to parking');

  try {
    // Get the parking queue with populated driver queue
    const parkingQueue = await ParkingQueue.findById(parkingQueueId)
      .populate('driverQueue.driverId')
      .session(useSession);

    if (!parkingQueue || !parkingQueue.isActive) {
      throw new Error('Parking queue not found or inactive');
    }

    // Get the first waiting driver in queue
    const waitingDrivers = parkingQueue.driverQueue
      .filter((driver) => driver.status === 'waiting')
      .sort((a, b) => a.joinedAt - b.joinedAt);

    if (waitingDrivers.length === 0) {
      console.log(`👥 No waiting drivers in parking queue ${parkingQueueId}`);
      if (!session) await useSession.commitTransaction();
      return null;
    }

    const nextDriver = waitingDrivers[0];

    // Check if this ride is still active and not expired
    const activeOffer = parkingQueue.activeOffers.find(
      (offer) => offer.rideId.toString() === rideId.toString(),
    );
    if (!activeOffer || activeOffer.expiresAt < new Date()) {
      console.log(`❌ Ride ${rideId} offer expired or not found`);
      // Remove expired offer
      await ParkingQueue.findByIdAndUpdate(
        parkingQueueId,
        { $pull: { activeOffers: { rideId: rideId } } },
        { session: useSession },
      );
      if (!session) await useSession.commitTransaction();
      return null;
    }

    // Update driver status to "offered" and set current offer
    const updatedQueue = await ParkingQueue.findOneAndUpdate(
      {
        _id: parkingQueueId,
        'driverQueue.driverId': nextDriver.driverId?._id,
        'driverQueue.status': 'waiting', // Ensure no race condition
      },
      {
        $set: {
          'driverQueue.$.status': 'offered',
          'driverQueue.$.currentOfferId': rideId,
        },
      },
      { new: true, session: useSession },
    );

    if (!updatedQueue) {
      throw new Error(
        'Failed to update driver status - possible race condition',
      );
    }

    // Get full ride details for emission
    const ride = await RideModel.findById(rideId)
      .populate('passengerId')
      .populate({
        path: 'passengerId',
        populate: { path: 'userId' },
      })
      .session(useSession);

    if (!ride || ride.status !== 'REQUESTED') {
      throw new Error('Ride no longer available');
    }

    // Emit ride offer to the driver via socket
    emitToUser(nextDriver.driverId?.userId, 'ride:new_airport_ride_request', {
      success: true,
      objectType: 'new-airport-ride-request',
      data: ride,
      timeout: 10000, // 10 seconds
      parkingLotId: parkingQueue.parkingLotId,
      parkingQueueId: parkingQueueId,
      message: 'New airport ride available',
    });

    console.log(
      `🎯 Offered ride ${rideId} to driver ${nextDriver.driverId?._id} (top of queue)`,
    );

    // Set timeout to move driver to end and offer to next driver if no response
    setTimeout(async () => {
      await handleDriverNoResponse(
        parkingQueueId,
        rideId,
        nextDriver.driverId._id,
      );
    }, 10000);

    if (!session) await useSession.commitTransaction();
    return nextDriver.driverId._id;
  } catch (error) {
    if (!session) await useSession.abortTransaction();
    console.error('Error offering ride to next driver:', error);
    return null;
  } finally {
    if (!session) useSession.endSession();
  }
};

const handleDriverNoResponse = async (parkingQueueId, rideId, driverId) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Check if driver is still in "offered" status for this ride
    const parkingQueue = await ParkingQueue.findOne({
      _id: parkingQueueId,
      'driverQueue.driverId': driverId,
      'driverQueue.status': 'offered',
      'driverQueue.currentOfferId': rideId,
    }).session(session);

    if (!parkingQueue) {
      // Driver already responded or was removed
      await session.commitTransaction();
      return;
    }

    // MOVE DRIVER TO END OF QUEUE: Remove and re-add with new joinedAt
    await ParkingQueue.findByIdAndUpdate(
      parkingQueueId,
      [
        {
          $set: {
            driverQueue: {
              $concatArrays: [
                // Keep all drivers except this one
                {
                  $filter: {
                    input: '$driverQueue',
                    as: 'driver',
                    cond: { $ne: ['$$driver.driverId', driverId] },
                  },
                },
                // Add this driver back at the end with updated joinedAt
                [
                  {
                    driverId: driverId,
                    joinedAt: new Date(), // New joinedAt to put at end
                    status: 'waiting',
                    currentOfferId: null,
                  },
                ],
              ],
            },
          },
        },
      ],
      { session },
    );

    console.log(`Driver ${driverId} didn't respond, moved to end of queue`);

    // Offer to the NEW first driver in queue
    await offerRideToNextDriver(parkingQueueId, rideId, session);

    await session.commitTransaction();
  } catch (error) {
    await session.abortTransaction();
    console.error('Error handling driver no response:', error);
  } finally {
    session.endSession();
  }
};

export const handleDriverRideResponse = async (
  driverId,
  rideId,
  accepted,
  parkingQueueId,
) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    if (accepted) {
      // Driver accepted the ride
      await acceptRideOffer(driverId, rideId, parkingQueueId, session);
    } else {
      // Driver declined the ride - MOVE TO END OF QUEUE
      await declineRideOffer(driverId, rideId, parkingQueueId, session);
    }

    await session.commitTransaction();

    return {
      success: true,
      message: `Ride ${accepted ? 'accepted' : 'declined'} successfully`,
    };
  } catch (error) {
    await session.abortTransaction();
    console.error('Error handling driver ride response:', error);
    throw error;
  } finally {
    session.endSession();
  }
};

// const acceptRideOffer = async (driverId, rideId, parkingQueueId, session) => {
//   // Remove driver from queue entirely (since they got a ride)
//   const parkingQueue = await ParkingQueue.findOne({
//     _id: parkingQueueId,
//     'driverQueue.driverId': driverId,
//     'driverQueue.status': 'offered',
//     'driverQueue.currentOfferId': rideId,
//   }).session(session);

//   if (!parkingQueue) {
//     throw new Error('Ride offer not found or already responded');
//   }

//   const success = await ParkingQueue.findByIdAndUpdate(
//     parkingQueueId,
//     {
//       $pull: {
//         driverQueue: { driverId: driverId },
//         activeOffers: { rideId: rideId },
//       },
//     },
//     { new: true, session },
//   );
//   if (!success) {
//     throw new Error('Failed to update parking queue');
//   }

//   console.log(
//     `✅ Driver ${driverId} accepted ride ${rideId} and removed from queue`,
//   );
// };

const acceptRideOffer = async (driverId, rideId, parkingQueueId, session) => {
  // Remove driver from queue entirely (since they got a ride)
  const parkingQueue = await ParkingQueue.findOne({
    _id: parkingQueueId,
    'driverQueue.driverId': driverId,
    'driverQueue.status': 'offered',
    'driverQueue.currentOfferId': rideId,
  })
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
    .session(session);

  if (!parkingQueue) {
    throw new Error('Ride offer not found or already responded');
  }

  const updatedQueue = await ParkingQueue.findByIdAndUpdate(
    parkingQueueId,
    {
      $pull: {
        driverQueue: { driverId: driverId },
        activeOffers: { rideId: rideId },
      },
    },
    { new: true, session },
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
    throw new Error('Failed to update parking queue');
  }

  console.log('Updated Queue: ', updatedQueue);

  // Emit updated queue data to all remaining drivers (same as removeDriverFromQueue)
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
          queueInfo: {
            queueId: updatedQueue._id,
            parkingLot: updatedQueue.parkingLotId,
            airport: updatedQueue.airportId,
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

  console.log(
    `✅ Driver ${driverId} accepted ride ${rideId} and removed from queue`,
  );

  return {
    success: true,
    message: `Driver ${driverId} accepted ride ${rideId} and removed from queue`,
    data: {
      driverId: driverId,
      rideId: rideId,
      parkingQueueId: parkingQueueId,
      action: 'ride_accepted',
      notifiedDrivers: waitingDrivers.length,
    },
  };
};

// const declineRideOffer = async (driverId, rideId, parkingQueueId, session) => {
//   // MOVE DRIVER TO END OF QUEUE
//   const success = await ParkingQueue.findByIdAndUpdate(
//     parkingQueueId,
//     [
//       {
//         $set: {
//           driverQueue: {
//             $concatArrays: [
//               // Keep all drivers except this one
//               {
//                 $filter: {
//                   input: '$driverQueue',
//                   as: 'driver',
//                   cond: { $ne: ['$$driver.driverId', driverId] },
//                 },
//               },
//               // Add this driver back at the end
//               [
//                 {
//                   driverId: driverId,
//                   joinedAt: new Date(), // New joinedAt to put at end
//                   status: 'waiting',
//                   currentOfferId: null,
//                 },
//               ],
//             ],
//           },
//         },
//       },
//     ],
//     { new: true, session },
//   );
//   if (!success) {
//     throw new Error('Failed to reject ride request');
//   }

//   console.log(
//     `Driver ${driverId} declined ride ${rideId}, moved to end of queue`,
//   );

//   // Offer to the NEW first driver in queue
//   await offerRideToNextDriver(parkingQueueId, rideId, session);
// };

const declineRideOffer = async (driverId, rideId, parkingQueueId, session) => {
  // MOVE DRIVER TO END OF QUEUE
  const updatedQueue = await ParkingQueue.findByIdAndUpdate(
    parkingQueueId,
    [
      {
        $set: {
          driverQueue: {
            $concatArrays: [
              // Keep all drivers except this one
              {
                $filter: {
                  input: '$driverQueue',
                  as: 'driver',
                  cond: { $ne: ['$$driver.driverId', driverId] },
                },
              },
              // Add this driver back at the end
              [
                {
                  driverId: driverId,
                  joinedAt: new Date(), // New joinedAt to put at end
                  status: 'waiting',
                  currentOfferId: null,
                },
              ],
            ],
          },
        },
      },
    ],
    { new: true, session },
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
    throw new Error('Failed to reject ride request');
  }

  // Emit updated queue data to all waiting drivers (same as other functions)
  const waitingDrivers = updatedQueue.driverQueue
    .filter((driver) => driver.status === 'waiting')
    .sort((a, b) => a.joinedAt - b.joinedAt);

  // Send updated queue data to each waiting driver
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
          queueInfo: {
            queueId: updatedQueue._id,
            parkingLot: updatedQueue.parkingLotId,
            airport: updatedQueue.airportId,
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

      // Emit to each waiting driver
      emitToUser(driver.driverId.userId._id, 'ride:parking_queue', queueData);
    }
  }

  console.log(
    `Driver ${driverId} declined ride ${rideId}, moved to end of queue`,
  );

  // Offer to the NEW first driver in queue
  await offerRideToNextDriver(parkingQueueId, rideId, session);

  return {
    success: true,
    message: `Driver ${driverId} declined ride ${rideId} and moved to end of queue`,
    data: {
      driverId: driverId,
      rideId: rideId,
      parkingQueueId: parkingQueueId,
      action: 'ride_declined',
      notifiedDrivers: waitingDrivers.length,
    },
  };
};

export const startProgressiveDriverSearch = async (ride) => {
  try {
    console.log(`🚗 Starting progressive driver search for ride ${ride._id}`);

    if (ride.isAirport) {
      console.log('Started Airport ride');
      await handleAirportRide(ride);
      return;
    }

    await handleRegularRide(ride);
  } catch (error) {
    console.error('Error starting progressive driver search:', error);
  }
};

driverSearchQueue.process('search-drivers', 10, async (job) => {
  const { rideId, phase } = job.data;

  try {
    const [rideData, searchParamsData] = await Promise.all([
      redis.get(`ride:${rideId}`),
      redis.get(`ride:${rideId}:search_params`),
    ]);

    if (!rideData || !searchParamsData) {
      console.log(`❌ Ride ${rideId} not found or expired`);
      return;
    }

    const ride = JSON.parse(rideData);
    const searchParams = JSON.parse(searchParamsData);
    const currentRide = await getRideById(rideId);

    // Check if ride is still active
    if (!currentRide || currentRide.status !== 'REQUESTED') {
      console.log(`🛑 Ride ${rideId} is no longer active`);
      return;
    }

    console.log(`🔍 Processing phase ${phase} search for ride ${rideId}`);

    if (phase === 1) {
      await handlePhase1Search(rideId, currentRide, searchParams);
    } else if (phase === 2) {
      await handlePhase2Search(rideId, currentRide, searchParams);
    }
  } catch (error) {
    console.error(`Error processing driver search for ride ${rideId}:`, error);
  }
});

driverSearchQueue.process('cancel-ride', 5, async (job) => {
  const { rideId } = job.data;

  try {
    const currentRide = await getRideById(rideId);
    if (currentRide && currentRide.status === 'REQUESTED') {
      console.log(`⏰ Auto-cancelling ride ${rideId} after search timeout`);
      await cancelExpiredRide(rideId);

      // Cleanup Redis
      await redis.del(`ride:${rideId}`);
      await redis.del(`ride:${rideId}:search_params`);
      await redis.del(`ride:${rideId}:phase1_searches`);
      await redis.del(`ride:${rideId}:phase2_searches`);
      await redis.del(`ride:${rideId}:notified_drivers`);
    }
  } catch (error) {
    console.error(`Error cancelling ride ${rideId}:`, error);
  }
});

const handlePhase1Search = async (rideId, ride, searchParams) => {
  try {
    const minRadius = searchParams.minRadius;
    console.log(
      `📍 Phase 1: Searching drivers in 0-${minRadius}km radius for ride ${rideId} (Zone: ${searchParams.zoneName})`,
    );

    // Search for drivers in min radius
    await notifyDriversInRadius(ride, minRadius, 0);

    // Get current search count and increment
    const searchCount = await redis.incr(`ride:${rideId}:phase1_searches`);
    console.log(
      `📊 Phase 1 search count: ${searchCount}/${searchParams.phase1Iterations} for ride ${rideId}`,
    );

    // Check if we should continue to next phase
    if (searchCount >= searchParams.phase1Iterations) {
      console.log(`🔄 Transitioning to Phase 2 for ride ${rideId}`);

      // Notify passenger about expanding search
      try {
        const notify = await notifyUser({
          userId: ride.passengerId?.userId,
          title: 'Expanding Driver Search Radius',
          message: `No driver available in ${minRadius}km radius of your location. We are expanding driver search radius to ${searchParams.maxRadius}km`,
          module: 'ride',
          type: 'ALERT',
          metadata: ride,
          storeInDB: false,
        });

        emitToRide(ride._id, 'ride:expanding_driver_searching_radius', {
          success: true,
          objectType: 'expanding-driver-searching-radius',
          data: {
            searchRadius: searchParams.maxRadius,
            previousRadius: minRadius,
            zoneName: searchParams.zoneName,
          },
          message: `No driver available in ${minRadius}km radius of your location. We are expanding driver search radius to ${searchParams.maxRadius}km`,
        });

        if (!notify) {
          console.log('⚠️ Failed to send notification to passenger');
        }
      } catch (notifyError) {
        console.error('Error notifying passenger:', notifyError);
      }

      // FIX: Initialize phase 2 counter BEFORE deleting phase 1 counter
      await redis.set(`ride:${rideId}:phase2_searches`, '0');

      // Start phase 2 immediately
      await driverSearchQueue.add(
        'search-drivers',
        { rideId, phase: 2 },
        {
          delay: 0,
          jobId: `ride-search-${rideId}-phase2-0`,
          removeOnComplete: true,
        },
      );

      // Cleanup phase 1 counter AFTER phase 2 is initialized
      await redis.del(`ride:${rideId}:phase1_searches`);
    } else {
      // Schedule next phase 1 search in 5 seconds
      await driverSearchQueue.add(
        'search-drivers',
        { rideId, phase: 1 },
        {
          delay: 5 * 1000, // 5 seconds
          jobId: `ride-search-${rideId}-phase1-${searchCount}`,
          removeOnComplete: true,
        },
      );
    }
  } catch (error) {
    console.error(`Error in handlePhase1Search for ride ${rideId}:`, error);
  }
};

const handlePhase2Search = async (rideId, ride, searchParams) => {
  try {
    const minRadius = searchParams.minRadius;
    const maxRadius = searchParams.maxRadius;

    console.log(
      `📍 Phase 2: Searching drivers in ${minRadius}-${maxRadius}km radius for ride ${rideId} (Zone: ${searchParams.zoneName})`,
    );

    // Update search radius in database
    await updateRideSearchRadius(rideId, maxRadius);

    // Search for drivers in expanded radius
    await notifyDriversInRadius(ride, maxRadius, minRadius);

    // Get current search count and increment
    const searchCount = await redis.incr(`ride:${rideId}:phase2_searches`);
    console.log(
      `📊 Phase 2 search count: ${searchCount}/${searchParams.phase2Iterations} for ride ${rideId}`,
    );

    // Check if we should continue searching
    if (searchCount < searchParams.phase2Iterations) {
      // Schedule next phase 2 search in 5 seconds
      await driverSearchQueue.add(
        'search-drivers',
        { rideId, phase: 2 },
        {
          delay: 5 * 1000,
          jobId: `ride-search-${rideId}-phase2-${searchCount}`,
          removeOnComplete: true,
        },
      );
    } else {
      console.log(`✅ Phase 2 completed for ride ${rideId}`);
      // Phase 2 completed, cleanup
      await redis.del(`ride:${rideId}:phase2_searches`);
    }
  } catch (error) {
    console.error(`Error in handlePhase2Search for ride ${rideId}:`, error);
  }
};

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
      // Min radius search - exclude previously notified drivers
      availableDrivers = await findNearbyDriverUserIds(
        ride.carType,
        ride.pickupLocation.coordinates,
        maxRadiusMeters,
        { excludeDriverIds: notifiedDrivers },
      );
    } else {
      // Expanded radius search - exclude previously notified drivers
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
      console.log(
        `❌ No available drivers in ${minRadius}-${maxRadius}km radius`,
      );
      return false;
    }

    // Double-check filtering
    const newDrivers = availableDrivers.filter(
      (driverId) => !notifiedDrivers.includes(driverId),
    );

    if (newDrivers.length === 0) {
      console.log(
        `ℹ️ No new drivers to notify in ${minRadius}-${maxRadius}km radius`,
      );
      return false;
    }

    console.log(
      `📢 Notifying ${newDrivers.length} new drivers in ${minRadius}-${maxRadius}km radius`,
    );

    const rideNotificationData = {
      success: true,
      objectType: 'new-ride',
      data: { ride, searchRadius: maxRadius },
      message: `New ride request from ${ride.pickupLocation.address} to ${ride.dropoffLocation.address} — tap to respond`,
    };

    // Notify ONLY new drivers
    for (const driverId of newDrivers) {
      try {
        emitToUser(driverId, 'ride:new_request', rideNotificationData);

        const notify = await notifyUser({
          userId: driverId,
          title: 'New Ride Request',
          message: `New ride request from ${ride.pickupLocation.address} to ${ride.dropoffLocation.address} — tap to respond`,
          module: 'ride',
          metadata: ride,
          actionLink: 'ride:find',
          storeInDB: false,
        });

        if (!notify) {
          console.log(`⚠️ Failed to send notification to driver ${driverId}`);
        }
      } catch (error) {
        console.error(`❌ Error notifying driver ${driverId}:`, error);
      }
    }

    // Store notified drivers in Redis
    if (newDrivers.length > 0) {
      await redis.sadd(cacheKey, newDrivers);
      await redis.expire(cacheKey, 300); // 5 minutes TTL
    }

    return true;
  } catch (error) {
    console.error(
      `❌ Error notifying drivers in radius ${minRadius}-${maxRadius}km:`,
      error,
    );
    return false;
  }
};

export const startDriverLocationMonitoring = async (rideId) => {
  try {
    const rideData = await redis.get(`ride:${rideId}`);
    if (!rideData) {
      console.log(`Ride ${rideId} not found for location monitoring`);
      return;
    }

    const ride = JSON.parse(rideData);

    // Set up interval to refresh driver locations every 5 seconds
    const monitoringInterval = setInterval(async () => {
      try {
        const currentRide = await getRideById(rideId);

        // Stop monitoring if ride is no longer active
        if (!currentRide || currentRide.status !== 'REQUESTED') {
          clearInterval(monitoringInterval);
          console.log(`🛑 Stopped location monitoring for ride ${rideId}`);
          return;
        }

        // Check current phase and refresh locations
        const searchCount =
          (await redis.get(`ride:${rideId}:phase1_searches`)) || 0;
        const currentPhase = parseInt(searchCount) >= 24 ? 'phase2' : 'phase1';

        if (currentPhase === 'phase1') {
          await getDriversInRideRadius(ride, 1);
        } else {
          await getDriversInRideRadius(ride, 2);
        }

        console.log(
          `🔄 Refreshed driver locations for ride ${rideId} (${currentPhase})`,
        );
      } catch (error) {
        console.error(
          `Error monitoring driver locations for ride ${rideId}:`,
          error,
        );
      }
    }, 5000); // Every 5 seconds

    // Store interval reference for cleanup (optional)
    console.log(`🎯 Started location monitoring for ride ${rideId}`);
  } catch (error) {
    console.error('Error starting driver location monitoring:', error);
  }
};

export const getDriversInRideRadius = async (ride, phase = 1) => {
  try {
    const ridePickUpLocation = ride.pickupLocation?.coordinates;
    if (!ridePickUpLocation || ridePickUpLocation.length !== 2) {
      console.log(`Invalid ride pickup location for phase ${phase}`);
      return [];
    }

    let maxDistance, minDistance;
    if (phase === 1) {
      maxDistance = 5 * 1000; // 5km for phase 1
      minDistance = null; // No minimum
    } else if (phase === 2) {
      maxDistance = 10 * 1000; // 10km maximum
      minDistance = 5 * 1000; // 5km minimum
    } else {
      console.log(`Invalid phase: ${phase}`);
      return [];
    }

    const pipeline = [
      {
        $geoNear: {
          near: { type: 'Point', coordinates: ridePickUpLocation },
          distanceField: 'distance',
          maxDistance: maxDistance,
          spherical: true,
          key: 'location',
          query: {
            status: 'online',
            isAvailable: true,
            currentRideId: { $in: [null, undefined, ''] },
          },
        },
      },
    ];

    if (phase === 2) {
      pipeline.push({
        $match: {
          distance: { $gte: minDistance },
        },
      });
    }

    pipeline.push(
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
        $match: {
          'driver.vehicle.type': ride.carType,
          'driver.isBlocked': false,
          'driver.isSuspended': false,
          'driver.isActive': true,
          'driver.backgroundCheckStatus': 'approved',
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: 'driver.userId',
          foreignField: '_id',
          as: 'user',
        },
      },
      { $unwind: '$user' },
      {
        $match: {
          'user.isBlocked': { $ne: true },
        },
      },
      {
        $project: {
          driverId: 1,
          userId: '$driver.userId',
          location: 1,
          distance: 1,
          heading: 1,
          speed: 1,
          accuracy: 1,
          lastUpdated: 1,
          driverName: '$user.name',
          driverImage: '$user.profileImg',
          vehicleType: '$driver.vehicle.type',
          vehicleModel: '$driver.vehicle.model',
          vehiclePlate: '$driver.vehicle.plateNumber',
          status: 1,
          isAvailable: 1,
        },
      },
      { $sort: { distance: 1 } },
    );

    const driversInRadius = await DriverLocation.aggregate(pipeline);
    const radiusMessage =
      phase === 1 ? 'within 5km radius' : 'within 6-10km radius';

    console.log(
      `📍 Phase ${phase}: Found ${driversInRadius.length} drivers ${radiusMessage}`,
    );

    if (driversInRadius && driversInRadius.length > 0) {
      emitToRide(ride._id, 'ride:nearby_drivers', {
        success: true,
        objectType: 'nearby-drivers',
        data: driversInRadius,
        message: "Nearby driver's location fetched successfully",
      });
    }

    return driversInRadius;
  } catch (error) {
    console.error(`Error in getDriversInRideRadius phase ${phase}:`, error);
    return [];
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

// Helper functions
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

const getRideById = async (rideId) => {
  return await RideModel.findById(rideId);
};

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
