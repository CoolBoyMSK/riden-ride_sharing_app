import mongoose from 'mongoose';
import {
  updatePassengerBlockStatus,
  findPassenger,
  deletePassenger,
  findPassengerDetails,
  findPassengerUpdateRequests,
  findPassengersWithSearch,
  updatePassengerRequest,
} from '../../../dal/passenger.js';
import {
  countPassengerBookings,
  findAllBookingsByPassengerId,
  countCanceledBookingsByPassengerId,
  countCompletedBookingsByPassengerId,
} from '../../../dal/booking.js';
import { getPassengerCards } from '../../../dal/stripe.js';

export const getAllPassengers = async (
  { search, page = 1, limit = 10, fromDate, toDate },
  resp,
) => {
  try {
    const result = await findPassengersWithSearch(
      search,
      page,
      limit,
      fromDate,
      toDate,
    );
    if (!result) {
      resp.error = true;
      resp.error_message = 'Failed ti fetch passengers';
      return resp;
    }

    resp.data = result;
    resp.error = false;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = 'Something went wrong while searching passenger';
    return resp;
  }
};

export const getPassengerById = async ({ passengerId }, resp) => {
  try {
    const passenger = await findPassengerDetails({ _id: passengerId });
    if (!passenger) {
      resp.error = true;
      resp.error_message = 'Passenger not found';
      return resp;
    }

    const paymentMethods = await getPassengerCards(passenger);

    resp.data = {
      ...(passenger.toObject?.() || passenger),
      paymentMethods,
      bookings: (await findAllBookingsByPassengerId(passengerId)) || null,
      totalbookings: (await countPassengerBookings(passengerId)) || 0,
      completedBookings:
        (await countCompletedBookingsByPassengerId(passengerId)) || 0,
      canceledBookings:
        (await countCanceledBookingsByPassengerId(passengerId)) || 0,
    };

    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = 'Something went wrong while fetching passenger';
    return resp;
  }
};

export const deletePassengerById = async ({ passengerId }, resp) => {
  try {
    const passenger = await findPassenger({ _id: passengerId });
    if (!passenger) {
      resp.error = true;
      resp.error_message = 'Passenger not found';
      return resp;
    }

    const filter = { userId: passenger.userId, passengerId: passenger._id };
    const deleted = await deletePassenger(filter);

    if (!deleted) {
      resp.error = true;
      resp.error_message = 'Failed to delete Passenger';
      return resp;
    }

    resp.data = deleted;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = 'Something went wrong while deleting passenger';
    return resp;
  }
};

export const blockPassenger = async (passengerId, resp) => {
  const updated = await updatePassengerBlockStatus(passengerId, true);
  if (!updated) {
    resp.error = true;
    resp.error_message = 'Passenger not found';
    return resp;
  }
  resp.data = { id: updated._id, isBlocked: updated.isBlocked };
  return resp;
};

export const unblockPassenger = async (passengerId, resp) => {
  const updated = await updatePassengerBlockStatus(passengerId, false);
  if (!updated) {
    resp.error = true;
    resp.error_message = 'Passenger not found';
    return resp;
  }
  resp.data = { id: updated._id, isBlocked: updated.isBlocked };
  return resp;
};

export const getAllUpdateRequests = async (
  { page, limit, search, fromDate, toDate },
  resp,
) => {
  try {
    const result = await findPassengerUpdateRequests(
      {},
      page,
      limit,
      search,
      fromDate,
      toDate,
    );
    if (!result) {
      resp.error = true;
      resp.error_message = 'Failed to fetch requests';
      return resp;
    }

    resp.data = {
      requests: result.data,
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
    };

    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = 'Something went wrong while Fetching update requests';
    return resp;
  }
};

export const toggleUpdateRequest = async ({ status, id }, resp) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const updated = await updatePassengerRequest(id, status, session);
    if (!updated) {
      await session.abortTransaction();
      session.endSession();
      resp.error = true;
      resp.error_message = 'Failed to toggle request';
      return resp;
    }

    await session.commitTransaction();
    session.endSession();

    resp.data = updated;
    return resp;
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message =
      'Something went wrong while toggling the update request';
    return resp;
  }
};
