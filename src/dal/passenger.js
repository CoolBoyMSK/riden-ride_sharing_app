import PassengerModel from '../models/Passenger.js';
import UserModel from '../models/User.js';

export const findPassenger = (filter, project = {}, options = {}) =>
  PassengerModel.findOne(filter, project, options);

export const findPassengerDetails = (filter) =>
  PassengerModel.findOne(filter).populate('userId');

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

export const findPassengersWithSearch = async (
  filter,
  { page = 1, limit = 10 },
) => {
  const matchStage = {};
  if (filter.search) {
    matchStage['user.name'] = { $regex: filter.search, $options: 'i' };
  }

  const results = await PassengerModel.aggregate([
    {
      $lookup: {
        from: 'users', // Collection name for User model
        localField: 'userId',
        foreignField: '_id',
        as: 'user',
      },
    },
    { $unwind: '$user' },
    { $match: matchStage },
    { $skip: (page - 1) * limit },
    { $limit: limit },
    {
      $project: {
        isActive: 1,
        isBlocked: 1,
        paymentMethods: 1,
        addresses: 1,
        'user.name': 1,
        'user.email': 1,
        'user.phoneNumber': 1,
        'user.profileImg': 1,
        'user.roles': 1,
      },
    },
  ]);

  return results;
};
