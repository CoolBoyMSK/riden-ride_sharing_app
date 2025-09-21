import { handleResponse } from '../../../utils/handleRespone.js';
import {
  getCompletedBookings,
  getOngoingBookings,
  getBookingById,
} from '../../../services/Admin/Booking/index.js';

export const getCompletedBookingsController = (req, res) =>
  handleResponse(
    {
      handler: getCompletedBookings,
      validationFn: null,
      handlerParams: [req.user, req.query],
      successMessage: 'Completed Bookings fetched successfully',
    },
    req,
    res,
  );

export const getOngoingBookingsController = (req, res) =>
  handleResponse(
    {
      handler: getOngoingBookings,
      validationFn: null,
      handlerParams: [req.user, req.query],
      successMessage: 'Ongoing Bookings fetched successfully',
    },
    req,
    res,
  );

export const getBookingByIdController = (req, res) =>
  handleResponse(
    {
      handler: getBookingById,
      validationFn: null,
      handlerParams: [req.user, req.params],
      successMessage: 'Booking fetched successfully',
    },
    req,
    res,
  );
