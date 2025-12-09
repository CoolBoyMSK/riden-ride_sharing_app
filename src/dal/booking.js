import bookingModel from '../models/Ride.js';
import Report from '../models/Report.js';
import Feedback from '../models/Feedback.js';
import RideReceipt from '../models/RideReceipt.js';
import { generateUniqueId } from '../utils/auth.js';

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

  // Return only non-scheduled (regular) rides in this list.
  // Scheduled rides are now served via findScheduledBookingsByDriverId.
  // Explicitly exclude scheduled rides - only include rides where isScheduledRide is NOT true
  // This handles cases where isScheduledRide is false, null, undefined, or doesn't exist
  const baseQuery = {
    driverId,
    isScheduledRide: { $ne: true },
  };

  const bookings = await bookingModel
    .find(baseQuery)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(safeLimit)
    .lean();

  const total = await bookingModel.countDocuments(baseQuery);

  return {
    data: bookings,
    currentPage: safePage,
    totalPages: Math.ceil(total / safeLimit),
    totalRecords: total,
  };
};

// Scheduled bookings for a driver (rides assigned to this driver)
// Shows ALL scheduled rides that were previously assigned to the driver, regardless of status
export const findScheduledBookingsByDriverId = async (
  driverId,
  page = 1,
  limit = 10,
) => {
  const safePage =
    Number.isInteger(Number(page)) && Number(page) > 0 ? Number(page) : 1;
  const safeLimit =
    Number.isInteger(Number(limit)) && Number(limit) > 0 ? Number(limit) : 10;

  const skip = (safePage - 1) * safeLimit;

  // Show all scheduled rides assigned to this driver, regardless of status
  // This includes: SCHEDULED, DRIVER_ASSIGNED, DRIVER_ARRIVING, DRIVER_ARRIVED,
  // RIDE_STARTED, RIDE_IN_PROGRESS, RIDE_COMPLETED, CANCELLED_BY_PASSENGER,
  // CANCELLED_BY_SYSTEM, CANCELLED_BY_DRIVER, etc.
  const query = {
    driverId,
    isScheduledRide: true,
  };

  // Sort by updatedAt first (latest updated/completed rides first), then by createdAt
  // This ensures recently completed rides appear at the top
  const bookings = await bookingModel
    .find(query)
    .sort({ updatedAt: -1, createdAt: -1 })
    .skip(skip)
    .limit(safeLimit)
    .lean();

  const total = await bookingModel.countDocuments(query);

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

  report.uniqueId = generateUniqueId('report', report._id);
  await report.save();

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

  // Return only non-scheduled (regular) rides in this list.
  // Scheduled rides are now served via findScheduledBookingsByPassengerId.
  // Explicitly exclude scheduled rides - only include rides where isScheduledRide is NOT true
  // This handles cases where isScheduledRide is false, null, undefined, or doesn't exist
  // Include all rides including cancelled ones (CANCELLED_BY_PASSENGER, CANCELLED_BY_SYSTEM)
  const baseQuery = {
    passengerId,
    isScheduledRide: { $ne: true },
  };

  const bookings = await bookingModel
    .find(baseQuery)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(safeLimit)
    .lean();

  const total = await bookingModel.countDocuments(baseQuery);

  return {
    data: bookings,
    currentPage: safePage,
    totalPages: Math.ceil(total / safeLimit),
    totalRecords: total,
  };
};

// Scheduled bookings for a passenger (scheduled rides: future + in-progress + cancelled)
export const findScheduledBookingsByPassengerId = async (
  passengerId,
  page = 1,
  limit = 10,
) => {
  const safePage =
    Number.isInteger(Number(page)) && Number(page) > 0 ? Number(page) : 1;
  const safeLimit =
    Number.isInteger(Number(limit)) && Number(limit) > 0 ? Number(limit) : 10;

  const skip = (safePage - 1) * safeLimit;
  const now = new Date();

  const query = {
    passengerId,
    isScheduledRide: true,
    $or: [
      // Future scheduled rides
      {
        status: { $in: ['SCHEDULED', 'REQUESTED', 'DRIVER_ASSIGNED'] },
        scheduledTime: { $gte: now },
      },
      // Scheduled rides already in progress
      {
        status: {
          $in: [
            'DRIVER_ARRIVING',
            'DRIVER_ARRIVED',
            'RIDE_STARTED',
            'RIDE_IN_PROGRESS',
          ],
        },
      },
      // Completed scheduled rides
      {
        status: 'RIDE_COMPLETED',
      },
      // Cancelled scheduled rides (by passenger or system)
      {
        status: {
          $in: ['CANCELLED_BY_PASSENGER', 'CANCELLED_BY_SYSTEM'],
        },
      },
    ],
  };

  // Sort by updatedAt first (latest updated/completed rides first), then by createdAt
  // This ensures recently completed rides appear at the top
  const bookings = await bookingModel
    .find(query)
    .sort({ updatedAt: -1, createdAt: -1 })
    .skip(skip)
    .limit(safeLimit)
    .lean();

  const total = await bookingModel.countDocuments(query);

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
        path: 'passengerId',
        select: 'userId',
        populate: {
          path: 'userId',
          select: 'name email phoneNumber profileImg',
        },
      },
      { path: 'driverRating' },
      {
        path: 'driverId',
        select: 'userId vehicle',
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

  report.uniqueId = generateUniqueId('report', report._id);
  await report.save();

  return report;
};

export const createBookingPassengerRating = async (
  passengerId,
  bookingId,
  rating,
  feedback,
) => {
  const booking = await bookingModel.findOne({
    _id: bookingId,
    passengerId,
  });

  if (!booking.isRatingAllow) {
    throw new Error('Feedback is not allowed after 24h');
  } else if (booking.driverRating) {
    throw new Error('Feedback already posted');
  }

  const newFeedback = await Feedback.create({
    passengerId: booking.passengerId,
    driverId: booking.driverId,
    rideId: booking._id,
    type: 'by_passenger',
    rating,
    feedback,
  });

  const result = await bookingModel.findOneAndUpdate(
    {
      _id: booking._id,
      passengerId,
    },
    { driverRating: newFeedback },
    { new: true },
  );

  return result;
};

export const createBookingDriverRating = async (
  driverId,
  bookingId,
  rating,
  feedback,
) => {
  const booking = await bookingModel.findOne({
    _id: bookingId,
    driverId,
  });

  if (!booking.isRatingAllow) {
    throw new Error('Feedback is not allowed after 24h');
  } else if (booking.passengerRating) {
    throw new Error('Feedback already posted');
  }

  const newFeedback = await Feedback.create({
    passengerId: booking.passengerId,
    driverId: booking.driverId,
    rideId: booking._id,
    type: 'by_driver',
    rating,
    feedback,
  });

  const result = await bookingModel.findOneAndUpdate(
    {
      _id: booking._id,
      driverId,
    },
    { passengerRating: newFeedback },
    { new: true },
  );

  return result;
};

export const findReceipt = async (BookingId) =>
  RideReceipt.findOne({ rideId: BookingId });
