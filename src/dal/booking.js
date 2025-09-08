import bookingModel from '../models/Ride.js';

export const findMyBookingsByPassengerId = (passengerId) => {
  return bookingModel
    .find({
      passengerId,
      $or: [{ status: 'RIDE_COMPLETED' }, { status: 'RIDE_IN_PROGRESS' }],
    })
    .sort({ createdAt: -1 });
};

export const findBookingByIdAndUserId = (passengerId, bookingId) => {
  bookingModel.findOne({ _id: bookingId, passengerId });
};
