import {
  findFinishedBookings,
  findOngoingBookings,
  findScheduledBookings,
  findBookingById,
  findNearestDriversForScheduledRide,
  assignDriverToScheduledRide,
  updateScheduledRideStatus,
} from '../../../dal/admin/index.js';

export const getCompletedBookings = async (
  { page = 1, limit = 10, search = '', fromDate, toDate },
  resp,
) => {
  try {
    const bookings = await findFinishedBookings({
      page,
      limit,
      search,
      fromDate,
      toDate,
    });
    if (!bookings) {
      resp.error = true;
      resp.error_message = 'Failed to fetch bookings';
      return resp;
    }

    resp.data = bookings;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'something went wrong';
    return resp;
  }
};

export const getOngoingBookings = async (
  { page = 1, limit = 10, search = '', fromDate, toDate },
  resp,
) => {
  try {
    const bookings = await findOngoingBookings(
      page,
      limit,
      search,
      fromDate,
      toDate,
    );
    if (!bookings) {
      resp.error = true;
      resp.error_message = 'Failed to fetch bookings';
      return resp;
    }

    resp.data = bookings;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'something went wrong';
    return resp;
  }
};

export const getScheduledBookings = async (
  {
    page = 1,
    limit = 10,
    search = '',
    fromDate,
    toDate,
    driverAssigned = false,
  },
  resp,
) => {
  try {
    const bookings = await findScheduledBookings({
      page,
      limit,
      search,
      fromDate,
      toDate,
      driverAssigned,
    });
    if (!bookings) {
      resp.error = true;
      resp.error_message = 'Failed to fetch scheduled bookings';
      return resp;
    }

    resp.data = bookings;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'something went wrong';
    return resp;
  }
};

export const getBookingById = async ({ id }, resp) => {
  try {
    const booking = await findBookingById(id);
    if (!booking) {
      resp.error = true;
      resp.error_message = 'Failed to fetch booking';
      return resp;
    }

    resp.data = booking;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'something went wrong';
    return resp;
  }
};

export const getNearestDriversForScheduledRide = async (
  { id },
  { page = 1, limit = 10, search = '' },
  resp,
) => {
  try {
    const drivers = await findNearestDriversForScheduledRide({
      rideId: id,
      page,
      limit,
      search,
    });
    if (!drivers) {
      resp.error = true;
      resp.error_message = 'Failed to fetch drivers';
      return resp;
    }

    resp.data = drivers;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'something went wrong';
    return resp;
  }
};

export const assignDriver = async ({ id }, { driverId }, resp) => {
  try {
    const success = await assignDriverToScheduledRide({
      rideId: id,
      driverId,
    });
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to assign driver to scheduled ride';
      return resp;
    }

    resp.data = success;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'something went wrong';
    return resp;
  }
};

export const rejectScheduledRide = async ({ id }, { reason = '' }, resp) => {
  try {
    const success = await updateScheduledRideStatus(id, {
      status: 'CANCELLED_BY_SYSTEM',
      paymentStatus: 'CANCELLED',
      cancelledBy: 'system',
      cancellationReason: reason.trim(),
      cancelledAt: new Date(),
    });
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to reject scheduled ride';
      return resp;
    }

    resp.data = success;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'something went wrong';
    return resp;
  }
};
