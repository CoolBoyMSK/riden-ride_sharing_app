import { handleResponse } from '../../../../utils/handleRespone.js';
import {
  getAllBookings,
  getBookingById,
  addBookingReport,
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
