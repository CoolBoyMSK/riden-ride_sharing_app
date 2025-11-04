import {
  findAllBookingsByDriverId,
  createBookingReportByDriverId,
  findBookingById,
  createBookingDriverRating,
  findReceipt,
} from '../../../../dal/booking.js';
import { findDriverByUserId, findDriverData } from '../../../../dal/driver.js';
import {
  findActiveRideByDriver,
  upsertDriverLocation,
} from '../../../../dal/ride.js';
import { generateRideReceipt } from '../../../../utils/receiptGenerator.js';
import { createAdminNotification } from '../../../../dal/notification.js';
import { emitToRide } from '../../../../realtime/socket.js';
import env from '../../../../config/envConfig.js';

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
    const driver = await findDriverData(user._id);
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

    const notify = await createAdminNotification({
      title: 'Issue Reported',
      message: `A driver ${driver.userId?.name} has reported an issue that needs your attention.`,
      metadata: success,
      module: 'report_management',
      type: 'ALERT',
      actionLink: `${env.FRONTEND_URL}/api/admin/support/report?id=${success._id}`,
    });
    if (!notify) {
      console.error('Failed to send notification');
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

export const rateBooking = async (user, { id }, { rating, feedback }, resp) => {
  try {
    const driver = await findDriverData(user._id);
    if (!driver) {
      resp.error = true;
      resp.error_message = 'Failed to fetch driver';
      return resp;
    }

    if (typeof rating !== 'number' || rating < 1 || rating > 5) {
      resp.error = true;
      resp.error_message = 'Rating must be a number between 1 and 5';
      return resp;
    } else if (feedback && (feedback.length < 3 || feedback.length > 500)) {
      resp.error = true;
      resp.error_message = 'Feedback must be between 3 and 500 characters';
      return resp;
    }

    const success = await createBookingDriverRating(
      driver._id,
      id,
      rating,
      feedback,
    );
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

export const updateLocation = async (user, { coordinates }, resp) => {
  try {
    const driver = await findDriverByUserId(user._id);
    if (!driver) {
      resp.error = true;
      resp.error_message = 'Failed to fetch driver';
      return resp;
    }

    const location = { type: 'Point', coordinates };
    const updatedLocation = await upsertDriverLocation(driver._id, {
      location,
    });
    if (!updatedLocation) {
      resp.error = true;
      resp.error_message = 'Failed to update driver location';
      return resp;
    }

    const ride = await findActiveRideByDriver(driver._id);
    if (ride) {
      emitToRide(ride._id, 'ride:driver_update_location', {
        success: true,
        objectType: 'driver-update-location',
        data: updatedLocation.location,
        message: 'Location updated successfully',
      });
    }

    resp.data = updatedLocation;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'something went wrong';
    return resp;
  }
};
