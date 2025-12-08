import mongoose from 'mongoose';
import {
  findAllBookingsByPassengerId,
  findScheduledBookingsByPassengerId,
  findPassengerBookingById,
  createBookingReportByPassengerId,
  createBookingPassengerRating,
  findReceipt,
} from '../../../../dal/booking.js';
import {
  findPassengerByUserId,
  findPassengerData,
} from '../../../../dal/passenger.js';
import { generateRideReceipt } from '../../../../utils/receiptGenerator.js';
import { createAdminNotification } from '../../../../dal/notification.js';
import env from '../../../../config/envConfig.js';

export const getAllBookings = async (user, { page, limit }, resp) => {
  try {
    const passenger = await findPassengerByUserId(user._id);
    if (!passenger) {
      resp.error = true;
      resp.error_message = 'Failed to fetch passenger';
      return resp;
    }

    const success = await findAllBookingsByPassengerId(
      passenger._id,
      page,
      limit,
    );
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

export const getScheduledBookings = async (user, { page, limit }, resp) => {
  try {
    const passenger = await findPassengerByUserId(user._id);
    if (!passenger) {
      resp.error = true;
      resp.error_message = 'Failed to fetch passenger';
      return resp;
    }

    const success = await findScheduledBookingsByPassengerId(
      passenger._id,
      page,
      limit,
    );
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to fetch scheduled bookings';
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
    const passenger = await findPassengerByUserId(user._id);
    if (!passenger) {
      resp.error = true;
      resp.error_message = 'Failed to fetch passenger';
      return resp;
    }

    const success = await findPassengerBookingById(passenger._id, id);
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
    const passenger = await findPassengerData(user._id);
    if (!passenger) {
      resp.error = true;
      resp.error_message = 'Failed to fetch passenger';
      return resp;
    }

    const success = await createBookingReportByPassengerId(
      passenger._id,
      id,
      reason,
    );
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to report booking';
      return resp;
    }

    const notify = await createAdminNotification({
      title: 'Issue Reported',
      message: `A passenger ${passenger.userId?.name} has reported an issue that needs your attention.`,
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
    const passenger = await findPassengerData(user._id);
    if (!passenger) {
      resp.error = true;
      resp.error_message = 'Failed to fetch passenger';
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

    const success = await createBookingPassengerRating(
      passenger._id,
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

    const success = await generateRideReceipt(id, 'passenger');
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
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      resp.error = true;
      resp.error_message = 'Invalid ride ID provided';
      return resp;
    }

    // Generate passenger receipt on-the-fly
    console.log(
      `📄 [downloadReceipt][passenger] Generating passenger receipt for ride ${id}...`,
    );

    const generated = await generateRideReceipt(id, 'passenger');

    if (!generated?.success) {
      console.error(
        `❌ [downloadReceipt][passenger] Failed to generate receipt for ride ${id}:`,
        generated?.error,
      );
      resp.error = true;
      resp.error_message =
        generated?.error || 'Failed to generate receipt for this ride';
      return resp;
    }

    // Get the PDF buffer from the generated receipt
    const pdfBuffer = Buffer.from(generated.receipt.base64, 'base64');

    if (!pdfBuffer || pdfBuffer.length < 100) {
      console.error(
        `❌ [downloadReceipt][passenger] Invalid PDF data for ride ${id}`,
      );
      resp.error = true;
      resp.error_message = 'Receipt PDF data is invalid';
      return resp;
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${generated.receipt.fileName || `receipt-${id}-passenger.pdf`}"`,
    );
    res.setHeader('Content-Length', pdfBuffer.length);

    resp.data = pdfBuffer;
    return resp;
  } catch (error) {
    console.error(`❌ [downloadReceipt][passenger] Error for ride ${id}:`, {
      message: error.message,
      stack: error.stack,
    });
    resp.error = true;
    resp.error_message = error.message || 'something went wrong';
    return resp;
  }
};
