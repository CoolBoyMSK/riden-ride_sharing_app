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

export const countPassengers = () => PassengerModel.countDocuments();

export const updatePassenger = (filter, payload) =>
  PassengerModel.findOneAndUpdate(filter, payload, { new: true });

export const updatePassengerById = (passengerId, payload) =>
  PassengerModel.findByIdAndUpdate(passengerId, payload, { new: true });

export const updatePassengerBlockStatus = (passengerId, isBlocked) =>
  PassengerModel.findByIdAndUpdate(
    passengerId,
    { isBlocked },
    { new: true },
  ).lean();

export const findPassengers = ({ page, limit }) =>
  PassengerModel.find()
    .skip((page - 1) * limit)
    .limit(limit)
    .populate({
      path: 'userId',
      select: 'name email phoneNumber profileImg roles',
    })
    .lean();
