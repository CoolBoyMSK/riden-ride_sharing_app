import {
  findMyBookingsByPassengerId,
  findBookingByIdAndUserId,
} from '../../../dal/booking.js';

export const getBookings = async (user, resp) => {
  try {
    const bookings = await findMyBookingsByPassengerId(user._id);
    if (!bookings) {
      resp.error = true;
      resp.error_message = 'Bookings not found';
      return resp;
    }

    resp.data = { bookings };
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = 'Something went wrong while fetching bookings';
    return resp;
  }
};

export const getBookingDetails = async (user, { bookingId }, resp) => {
  try {
    const booking = await findBookingByIdAndUserId(bookingId, user._id);
    if (!booking) {
      resp.error = true;
      resp.error_message = 'Booking not found';
      return resp;
    }

    resp.data = { booking };
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = 'Something went wrong while fetching booking details';
    return resp;
  }
};
