import { handleResponse } from '../../../../utils/handleRespone.js';
import {
  getAllBookings,
  getScheduledBookings,
  getBookingById,
  addBookingReport,
  rateBooking,
  downloadReceipt,
  generateReceipt,
} from '../../../../services/User/passenger/booking/index.js';

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

export const getScheduledBookingsController = (req, res) =>
  handleResponse(
    {
      handler: getScheduledBookings,
      validationFn: null,
      handlerParams: [req.user, req.query],
      successMessage: 'Scheduled bookings fetched successfully',
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

export const rateBookingController = (req, res) =>
  handleResponse(
    {
      handler: rateBooking,
      validationFn: null,
      handlerParams: [req.user, req.query, req.body],
      successMessage: 'Driver rated successfully',
    },
    req,
    res,
  );

export const generateReceiptController = (req, res) =>
  handleResponse(
    {
      handler: generateReceipt,
      validationFn: null,
      handlerParams: [req.query],
      successMessage: 'Receipt generated successfully',
    },
    req,
    res,
  );

export const downloadReceiptController = (req, res) =>
  handleResponse(
    {
      handler: downloadReceipt,
      validationFn: null,
      handlerParams: [req.query, res],
      successMessage: 'Receipt downloaded successfully',
    },
    req,
    res,
  );
