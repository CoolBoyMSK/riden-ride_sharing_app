import PassengerModel from '../models/Passenger.js';

export const findPassengerByUserId = (userId) =>
  PassengerModel.findOne({ userId }).lean();

export const createPassengerProfile = (userId) =>
  new PassengerModel({
    userId,
    isActive: false,
    isBlocked: false,
    paymentMethods: [],
  }).save();
