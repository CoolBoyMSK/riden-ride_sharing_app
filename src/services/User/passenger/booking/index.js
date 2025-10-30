import {
  findAllBookingsByPassengerId,
  findPassengerBookingById,
  createBookingReportByPassengerId,
  findReceipt,
} from '../../../../dal/booking.js';
import {
  findPassengerByUserId,
  findPassengerData,
} from '../../../../dal/passenger.js';
import { generateRideReceipt } from '../../../../utils/receiptGenerator.js';
import { createAdminNotification } from '../../../../dal/notification.js';

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
