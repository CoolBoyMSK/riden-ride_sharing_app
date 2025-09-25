import ComplainModel from '../models/ComplainTicket.js';
import Passenger from '../models/Passenger.js';
import Driver from '../models/Driver.js';
import Ride from '../models/Ride.js';
import Report from '../models/Report.js';
import mongoose from 'mongoose';
import { generateUniqueId } from '../utils/auth.js';
import { COMPLAIN_TYPES } from '../enums/complainTypes.js';

export const findComplainTypes = () => {
  return COMPLAIN_TYPES;
};

export const createComplain = async (payload) => {
  const ride = await Ride.findOne({ _id: payload.bookingId }).lean();
  if (!ride) return false;

  if (payload.user.roles.includes('driver')) {
    const driver = await Driver.findById(ride.driverId);
    if (!driver) return false;

    const complain = await ComplainModel.create({
      userId: driver.userId,
      bookingId: ride._id,
      category: 'by_driver',
      type: payload.type,
      text: payload.text,
      attachments: payload.attachments,
    });

    complain.uniqueId = generateUniqueId('complain', complain._id);
    await complain.save();

    return complain;
  }
  if (payload.user.roles.includes('passenger')) {
    const passenger = await Passenger.findById(ride.passengerId);
    if (!passenger) return false;

    const complain = await ComplainModel.create({
      userId: passenger.userId,
      bookingId: ride._id,
      category: 'by_passenger',
      type: payload.type,
      text: payload.text,
      attachments: payload.attachments,
    });

    complain.uniqueId = generateUniqueId('complain', complain._id);
    await complain.save();

    return complain;
  }
};

export const findComplains = async (userId, { page = 1, limit = 10 } = {}) => {
  const skip = (page - 1) * limit;

  const [complains, total] = await Promise.all([
    ComplainModel.find({ userId })
      .populate('userId bookingId')
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 }), // ✅ Optional: newest first
    ComplainModel.countDocuments({ userId }),
  ]);

  return {
    complains,
    total,
    page: page ? parseInt(page) : 0,
    limit: limit ? parseInt(limit) : 0,
    totalPages: Math.ceil(total / limit),
  };
};

export const getAllComplainTickets = async ({
  category,
  page = 1,
  limit = 10,
  search = '',
  fromDate,
  toDate,
}) => {
  // --- Pagination ---
  const safePage =
    Number.isInteger(Number(page)) && Number(page) > 0 ? Number(page) : 1;
  const safeLimit =
    Number.isInteger(Number(limit)) && Number(limit) > 0 ? Number(limit) : 10;
  const skip = (safePage - 1) * safeLimit;

  // --- Base filter ---
  const filter = {};
  if (category) filter.category = category;

  // --- Date filter ---
  if (fromDate || toDate) {
    filter.createdAt = {};
    if (fromDate) filter.createdAt.$gte = new Date(fromDate);
    if (toDate) {
      const endOfDay = new Date(`${toDate}T23:59:59.999Z`);
      filter.createdAt.$lte = endOfDay;
    }
  }

  // --- Search ---
  const safeSearch = typeof search === 'string' ? search.trim() : '';
  const escapedSearch = safeSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const baseStages = [
    { $match: filter },
    // Lookup User
    {
      $lookup: {
        from: 'users', // ensure this matches your actual collection
        localField: 'userId',
        foreignField: '_id',
        as: 'user',
      },
    },
    { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
    // Lookup Ride (booking)
    {
      $lookup: {
        from: 'rides', // ensure this matches your actual collection
        localField: 'bookingId',
        foreignField: '_id',
        as: 'booking',
      },
    },
    { $unwind: { path: '$booking', preserveNullAndEmptyArrays: true } },
  ];

  // --- Search filter ---
  if (safeSearch) {
    baseStages.push({
      $match: {
        $or: [
          { 'user.name': { $regex: escapedSearch, $options: 'i' } },
          {
            $expr: {
              $regexMatch: {
                input: { $toString: '$booking._id' },
                regex: escapedSearch,
                options: 'i',
              },
            },
          },
        ],
      },
    });
  }

  // --- Data pipeline ---
  const dataPipeline = [
    ...baseStages,
    { $sort: { createdAt: -1 } },
    { $skip: skip },
    { $limit: safeLimit },
    {
      $project: {
        _id: 1,
        category: 1,
        type: 1,
        text: 1,
        attachments: 1,
        status: 1,
        createdAt: 1,
        updatedAt: 1,
        'user._id': 1,
        'user.name': 1,
        'user.email': 1,
        'user.phoneNumber': 1,
        'user.profileImg': 1,
        'booking._id': 1,
      },
    },
  ];

  const countPipeline = [...baseStages, { $count: 'total' }];

  const [tickets, totalCountResult] = await Promise.all([
    mongoose.model('ComplainTicket').aggregate(dataPipeline),
    mongoose.model('ComplainTicket').aggregate(countPipeline),
  ]);

  const totalRecords = totalCountResult[0]?.total || 0;

  return {
    data: tickets,
    currentPage: safePage,
    totalPages: Math.ceil(totalRecords / safeLimit),
    limit: safeLimit,
    totalRecords,
  };
};

export const findComplainById = async (id) =>
  ComplainModel.findById(id).populate('userId bookingId').lean();

export const updateComplaniStatusById = async (id, status) =>
  ComplainModel.findByIdAndUpdate(id, { status }, { new: true })
    .populate('userId')
    .lean();

export const adminComplainReply = async (id, text, attachments) =>
  ComplainModel.findByIdAndUpdate(
    id,
    { $push: { chat: { isSupportReply: true, text, attachments } } },
    { new: true },
  )
    .populate('userId')
    .lean();

export const getAllReports = async ({
  type,
  page = 1,
  limit = 10,
  search = '',
  fromDate,
  toDate,
}) => {
  // --- Validate pagination ---
  const safePage =
    Number.isInteger(Number(page)) && Number(page) > 0 ? Number(page) : 1;
  const safeLimit =
    Number.isInteger(Number(limit)) && Number(limit) > 0 ? Number(limit) : 10;
  const skip = (safePage - 1) * safeLimit;

  // --- Build filter ---
  const filter = {};
  if (type) filter.type = type;

  // --- Date filter ---
  if (fromDate || toDate) {
    const dateFilter = {};
    if (fromDate) dateFilter.$gte = new Date(fromDate);
    if (toDate) {
      const to = new Date(toDate);
      // Ensure end of the day is included
      to.setHours(23, 59, 59, 999);
      dateFilter.$lte = to;
    }
    filter.createdAt = dateFilter;
  }

  // --- Escape search ---
  const safeSearch = typeof search === 'string' ? search.trim() : '';
  const escapedSearch = safeSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // --- Build aggregation stages ---
  const baseStages = [
    { $match: filter },

    {
      $lookup: {
        from: 'rides',
        localField: 'bookingId',
        foreignField: '_id',
        as: 'booking',
      },
    },
    { $unwind: { path: '$booking', preserveNullAndEmptyArrays: true } },

    {
      $lookup: {
        from: 'drivers',
        localField: 'driverId',
        foreignField: '_id',
        as: 'driver',
      },
    },
    { $unwind: { path: '$driver', preserveNullAndEmptyArrays: true } },

    {
      $lookup: {
        from: 'users',
        localField: 'driver.userId',
        foreignField: '_id',
        as: 'driverUser',
      },
    },
    { $unwind: { path: '$driverUser', preserveNullAndEmptyArrays: true } },

    {
      $lookup: {
        from: 'passengers',
        localField: 'passengerId',
        foreignField: '_id',
        as: 'passenger',
      },
    },
    { $unwind: { path: '$passenger', preserveNullAndEmptyArrays: true } },

    {
      $lookup: {
        from: 'users',
        localField: 'passenger.userId',
        foreignField: '_id',
        as: 'passengerUser',
      },
    },
    { $unwind: { path: '$passengerUser', preserveNullAndEmptyArrays: true } },
  ];

  // --- Search Stage ---
  if (safeSearch) {
    baseStages.push({
      $match: {
        $or: [
          { 'driverUser.name': { $regex: escapedSearch, $options: 'i' } },
          { 'passengerUser.name': { $regex: escapedSearch, $options: 'i' } },
          { 'booking.uniqueId': { $regex: escapedSearch, $options: 'i' } },
        ],
      },
    });
  }

  const dataPipeline = [
    ...baseStages,
    { $sort: { createdAt: -1 } },
    { $skip: skip },
    { $limit: safeLimit },
    {
      $project: {
        _id: 1,
        bookingId: 1,
        uniqueId: 1,
        status: 1,
        type: 1,
        reason: 1,
        createdAt: 1,
        updatedAt: 1,
        'booking.uniqueId': 1,
        'driver._id': 1,
        'driverUser._id': 1,
        'driverUser.name': 1,
        'driverUser.email': 1,
        'driverUser.phoneNumber': 1,
        'driverUser.profileImg': 1,
        'passenger._id': 1,
        'passengerUser._id': 1,
        'passengerUser.name': 1,
        'passengerUser.email': 1,
        'passengerUser.phoneNumber': 1,
        'passengerUser.profileImg': 1,
      },
    },
  ];

  const countPipeline = [...baseStages, { $count: 'total' }];

  const [reports, totalCountResult] = await Promise.all([
    Report.aggregate(dataPipeline),
    Report.aggregate(countPipeline),
  ]);

  const totalRecords = totalCountResult[0]?.total || 0;

  return {
    data: reports,
    currentPage: safePage,
    totalPages: Math.ceil(totalRecords / safeLimit),
    limit: safeLimit,
    totalRecords,
  };
};

export const findReportById = async (id) =>
  Report.findById(id)
    .populate([
      {
        path: 'passengerId',
        select: 'userId',
        populate: {
          path: 'userId',
          select: 'name email phoneNumber profileImg',
        },
      },
      {
        path: 'driverId',
        select: 'userId',
        populate: {
          path: 'userId',
          select: 'name email phoneNumber profileImg',
        },
      },
      {
        path: 'bookingId',
      },
    ])
    .lean();

export const updateReportStatusById = async (id, status) =>
  Report.findByIdAndUpdate(id, { status }, { new: true }).lean();

export const sendReplySupportChat = async (id, text, attachments) =>
  ComplainModel.findByIdAndUpdate(
    id,
    {
      $push: { chat: { isSupportReply: false, text, attachments } },
    },
    { new: true },
  ).lean();
