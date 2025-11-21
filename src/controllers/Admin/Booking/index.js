import { handleResponse } from '../../../utils/handleRespone.js';
import {
  getCompletedBookings,
  getOngoingBookings,
  getScheduledBookings,
  getBookingById,
  getNearestDriversForScheduledRide,
  assignDriver,
  rejectScheduledRide,
} from '../../../services/Admin/Booking/index.js';

export const getCompletedBookingsController = (req, res) =>
  handleResponse(
    {
      handler: getCompletedBookings,
      handlerParams: [req.query],
      successMessage: 'Completed Bookings fetched successfully',
    },
    req,
    res,
  );

export const getOngoingBookingsController = (req, res) =>
  handleResponse(
    {
      handler: getOngoingBookings,
      handlerParams: [req.query],
      successMessage: 'Ongoing Bookings fetched successfully',
    },
    req,
    res,
  );

export const getScheduledBookingsController = (req, res) =>
  handleResponse(
    {
      handler: getScheduledBookings,
      handlerParams: [req.query],
      successMessage: 'Scheduled Bookings fetched successfully',
    },
    req,
    res,
  );

export const getBookingByIdController = (req, res) =>
  handleResponse(
    {
      handler: getBookingById,
      handlerParams: [req.params],
      successMessage: 'Booking fetched successfully',
    },
    req,
    res,
  );

export const getNearestDriversForScheduledRideController = (req, res) =>
  handleResponse(
    {
      handler: getNearestDriversForScheduledRide,
      handlerParams: [req.params, req.query],
      successMessage: 'Driver assigned to booking successfully',
    },
    req,
    res,
  );

export const assignDriverToScheduledRideController = (req, res) =>
  handleResponse(
    {
      handler: assignDriver,
      handlerParams: [req.params, req.query],
      successMessage: 'Driver assigned to scheduled ride successfully',
    },
    req,
    res,
  );

export const rejectScheduledRideController = (req, res) =>
  handleResponse(
    {
      handler: rejectScheduledRide,
      handlerParams: [req.params, req.body],
      successMessage: 'Scheduled ride rejected successfully',
    },
    req,
    res,
  );