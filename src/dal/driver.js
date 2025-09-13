import DriverModel from '../models/Driver.js';

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

export const updateDriverByUserId = (id, update) =>
  DriverModel.findOneAndUpdate({ userId: id }, update, { new: true });

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
