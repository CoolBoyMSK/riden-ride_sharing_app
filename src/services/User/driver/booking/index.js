import {
  findAllBookingsByDriverId,
  createBookingReportByDriverId,
  findBookingById,
  findReceipt,
} from '../../../../dal/booking.js';
import { findDriverByUserId } from '../../../../dal/driver.js';
import { generateRideReceipt } from '../../../../utils/receiptGenerator.js';

export const getAllBookings = async (user, { page, limit }, resp) => {
  try {
    const driver = await findDriverByUserId(user._id);
    if (!driver) {
      resp.error = true;
      resp.error_message = 'Failed to fetch driver';
      return resp;
    }

    const success = await findAllBookingsByDriverId(driver._id, page, limit);
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
    resp.error_message = error.message || 'something went wrong';
    return resp;
  }
};

export const getBookingById = async (user, { id }, resp) => {
  try {
    const driver = await findDriverByUserId(user._id);
    if (!driver) {
      resp.error = true;
      resp.error_message = 'Failed to fetch driver';
      return resp;
    }

    const success = await findBookingById(driver._id, id);
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
    resp.error_message = error.message || 'something went wrong';
    return resp;
  }
};

export const addBookingReport = async (user, { id }, { reason }, resp) => {
  try {
    const driver = await findDriverByUserId(user._id);
    if (!driver) {
      resp.error = true;
      resp.error_message = 'Failed to fetch driver';
      return resp;
    }

    const success = await createBookingReportByDriverId(driver._id, id, reason);
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
    resp.error_message = error.message || 'something went wrong';
    return resp;
  }
};

export const generateReceipt = async ({ id }, resp) => {
  try {
    const exists = await findReceipt(id);
    if (exists) {
      resp.error = true;
      resp.error_message = 'receipt already exists';
      return resp;
    }

    const success = await generateRideReceipt(id);
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to generate receipt';
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

export const downloadReceipt = async ({ id }, res, resp) => {
  try {
    const success = await findReceipt(id);
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to find receipt';
      return resp;
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${success.fileName}"`,
    );
    res.setHeader('Content-Length', success.pdfData.length);

    resp.data = success.pdfData;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'something went wrong';
    return resp;
  }
};
