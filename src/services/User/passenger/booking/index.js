import {
  findAllBookingsByPassengerId,
  findPassengerBookingById,
  createBookingReportByPassengerId,
} from '../../../../dal/booking.js';
import { findPassengerByUserId } from '../../../../dal/passenger.js';

export const getAllBookings = async (user, { page, limit }, resp) => {
  try {
    const passenger = await findPassengerByUserId(user._id);
    if (!passenger) {
      resp.error = true;
      resp.error_message = 'Failed to fetch passenger';
      return resp;
    }

    const success = await findAllBookingsByPassengerId(
      passenger._id,
      page,
      limit,
    );
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to fetch bookings';
      return resp;
    }

    resp.data = success;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = 'Something went wrong while fetching bookings';
    return resp;
  }
};

export const getBookingById = async (user, { id }, resp) => {
  try {
    const passenger = await findPassengerByUserId(user._id);
    if (!passenger) {
      resp.error = true;
      resp.error_message = 'Failed to fetch passenger';
      return resp;
    }

    const success = await findPassengerBookingById(passenger._id, id);
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to fetch booking';
      return resp;
    }

    resp.data = success;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = 'Something went wrong while fetching booking';
    return resp;
  }
};

export const addBookingReport = async (user, { id }, { reason }, resp) => {
  try {
    const passenger = await findPassengerByUserId(user._id);
    if (!passenger) {
      resp.error = true;
      resp.error_message = 'Failed to fetch passenger';
      return resp;
    }

    const success = await createBookingReportByPassengerId(
      passenger._id,
      id,
      reason,
    );
    console.log(success);
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to report booking';
      return resp;
    }

    resp.data = success;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = 'Something went wrong while reporting booking';
    return resp;
  }
};
