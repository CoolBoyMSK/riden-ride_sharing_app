import { handleResponse } from '../../../../utils/handleRespone.js';
import {
  getAllBookings,
  getBookingById,
  addBookingReport,
} from '../../../../services/User/driver/booking/index.js';

export const getAllBookingsController = (req, res) =>
  handleResponse(
    {
      handler: getAllBookings,
      validationFn: null,
      handlerParams: [req.user, req.query],
      successMessage: 'Bookings fetched successfully',
    },
    req,
    res,
  );

export const getBookingByIdController = (req, res) =>
  handleResponse(
    {
      handler: getBookingById,
      validationFn: null,
      handlerParams: [req.user, req.query],
      successMessage: 'Booking fetched successfully',
    },
    req,
    res,
  );

export const addBookingReportController = (req, res) =>
  handleResponse(
    {
      handler: addBookingReport,
      validationFn: null,
      handlerParams: [req.user, req.query, req.body],
      successMessage: 'Booking reported successfully',
    },
    req,
    res,
  );
