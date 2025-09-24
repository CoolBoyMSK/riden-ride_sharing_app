import bookingModel from '../models/Ride.js';
import Report from '../models/Report.js';
import mongoose from 'mongoose';

export const findMyBookingsByPassengerId = (passengerId) => {
  return bookingModel
    .find({
      passengerId,
      $or: [{ status: 'RIDE_COMPLETED' }, { status: 'RIDE_IN_PROGRESS' }],
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

export const findAllBookingsByDriverId = async (
  driverId,
  page = 1,
  limit = 10,
) => {
  const safePage =
    Number.isInteger(Number(page)) && Number(page) > 0 ? Number(page) : 1;
  const safeLimit =
    Number.isInteger(Number(limit)) && Number(limit) > 0 ? Number(limit) : 10;

  const skip = (safePage - 1) * safeLimit;

  const bookings = await bookingModel
    .find({ driverId })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(safeLimit)
    .lean();

  const total = await bookingModel.countDocuments({ driverId });

  return {
    data: bookings,
    currentPage: safePage,
    totalPages: Math.ceil(total / safeLimit),
    totalRecords: total,
  };
};

export const findBookingById = async (driverId, bookingId) =>
  bookingModel
    .findOne({ _id: bookingId, driverId })
    .populate([
      {
        path: 'passengerId',
        select: 'userId',
        populate: {
          path: 'userId',
          select: 'name email phoneNumber profileImg',
        },
      },
      { path: 'driverRating' },
    ])
    .lean();

export const createBookingReportByDriverId = async (
  driverId,
  bookingId,
  reason,
) => {
  const booking = await bookingModel
    .findOneAndUpdate(
      { _id: bookingId, driverId },
      { isReported: true },
      { new: true },
    )
    .select('driverId passengerId')
    .lean();
  if (!booking) return false;

  const report = await Report.create({
    bookingId: booking._id,
    driverId: booking.driverId,
    passengerId: booking.passengerId,
    type: 'by_driver',
    reason,
  });
  if (!report) return false;

  return report;
};

export const findAllBookingsByPassengerId = async (
  passengerId,
  page = 1,
  limit = 10,
) => {
  const safePage =
    Number.isInteger(Number(page)) && Number(page) > 0 ? Number(page) : 1;
  const safeLimit =
    Number.isInteger(Number(limit)) && Number(limit) > 0 ? Number(limit) : 10;

  const skip = (safePage - 1) * safeLimit;

  const bookings = await bookingModel
    .find({ passengerId })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(safeLimit)
    .lean();

  const total = await bookingModel.countDocuments({ passengerId });

  return {
    data: bookings,
    currentPage: safePage,
    totalPages: Math.ceil(total / safeLimit),
    totalRecords: total,
  };
};

export const findPassengerBookingById = async (passengerId, bookingId) =>
  bookingModel
    .findOne({ _id: bookingId, passengerId })
    .populate([
      {
        path: 'driverId',
        select: 'userId',
        populate: {
          path: 'userId',
          select: 'name email phoneNumber profileImg',
        },
      },
      { path: 'passengerRating' },
    ])
    .lean();

export const createBookingReportByPassengerId = async (
  passengerId,
  bookingId,
  reason,
) => {
  const booking = await bookingModel
    .findOneAndUpdate(
      { _id: bookingId, passengerId },
      { isReported: true },
      { new: true },
    )
    .select('driverId passengerId')
    .lean();
  if (!booking) return false;

  const report = await Report.create({
    bookingId: booking._id,
    passengerId: booking.passengerId,
    driverId: booking.driverId,
    type: 'by_passenger',
    reason,
  });
  if (!report) return false;

  return report;
};
