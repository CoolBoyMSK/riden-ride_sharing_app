import DriverModel from '../models/Driver.js';

export const findDriverByUserId = (userId) =>
  DriverModel.findOne({ userId }).lean();

export const createDriverProfile = (userId) =>
  new DriverModel({
    userId,
    licenseDocs: { frontUrl: '', backUrl: '' },
    vehicle: { make: '', model: '', plateNumber: '', color: '' },
    backgroundCheckStatus: 'pending',
    payoutDetails: { bankAccount: '', ifscCode: '' },
  }).save();

export const countDrivers = () => DriverModel.countDocuments();

export const findDrivers = ({ page, limit }) =>
  DriverModel.find()
    .skip((page - 1) * limit)
    .limit(limit)
    .populate({
      path: 'userId',
      select: 'name email phoneNumber profileImg roles gender',
    })
    .lean();

export const addDriverSuspension = (driverId, reason, endDate) =>
  DriverModel.findByIdAndUpdate(
    driverId,
    {
      $push: {
        suspensions: { reason, start: new Date(), end: new Date(endDate) },
      },
      $set: { isBlocked: true },
    },
    { new: true },
  ).lean();

export const removeDriverBlock = (driverId) =>
  DriverModel.findByIdAndUpdate(
    driverId,
    { $set: { isBlocked: false } },
    { new: true },
  ).lean();
