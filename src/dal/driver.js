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
