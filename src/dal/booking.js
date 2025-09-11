import bookingModel from '../models/Ride.js';

export const findMyBookingsByPassengerId = (passengerId) => {
  return bookingModel
    .find({
      passengerId,
      $or: [{ status: 'RIDE_COMPLETED' }, { status: 'RIDE_IN_PROGRESS' }],
    })
    .sort({ createdAt: -1 })
    .lean();
};

export const findAllBookingsByPassengerId = (passengerId) => {
  return bookingModel
    .find({
      passengerId,
    })
    .populate({
      path: 'driverId.userId',
      select: 'name email phoneNumber profileImg',
    })
    .sort({ createdAt: -1 })
    .lean();
};

export const countCanceledBookingsByPassengerId = (passengerId) => {
  return bookingModel.countDocuments({
    passengerId,
    $or: [
      { status: 'CANCELLED_BY_PASSENGER' },
      { status: 'CANCELLED_BY_DRIVER' },
      { status: 'CANCELLED_BY_SYSTEM' },
    ],
  });
};

export const countCompletedBookingsByPassengerId = (passengerId) => {
  return bookingModel.countDocuments({
    passengerId,
    status: 'RIDE_COMPLETED',
  });
};

export const countPassengerBookings = (passengerId) => {
  return bookingModel.countDocuments({
    passengerId,
  });
};

export const findBookingByIdAndUserId = (passengerId, bookingId) => {
  bookingModel.findOne({ _id: bookingId, passengerId });
};
