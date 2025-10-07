import {
  findAdminById,
  findFinishedBookings,
  findOngoingBookings,
  findBookingById,
} from '../../../dal/admin/index.js';

export const getCompletedBookings = async (
  user,
  { page = 1, limit = 10, search = '', fromDate, toDate },
  resp,
) => {
  try {
    const admin = await findAdminById(user._id);
    if (!admin) {
      resp.error = true;
      resp.error_message = 'Failed to fetch admin';
      return resp;
    }

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
  user,
  { page = 1, limit = 10, search = '', fromDate, toDate },
  resp,
) => {
  try {
    const admin = await findAdminById(user._id);
    if (!admin) {
      resp.error = true;
      resp.error_message = 'Failed to fetch admin';
      return resp;
    }

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

export const getBookingById = async (user, { id }, resp) => {
  try {
    const admin = await findAdminById(user._id);
    if (!admin) {
      resp.error = true;
      resp.error_message = 'Failed to fetch admin';
      return resp;
    }

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
