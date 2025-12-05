import { findRideByRideId } from '../../../dal/ride.js';
import {
  findComplainTypes,
  findBookingIds,
  createComplain,
  findComplains,
  findComplainById,
  sendReplySupportChat,
} from '../../../dal/support.js';
import {
  uploadPassengerImage,
  uploadDriverImage,
} from '../../../utils/s3Uploader.js';
import { createAdminNotification } from '../../../dal/notification.js';
import env from '../../../config/envConfig.js';

export const getComplainTypes = async (user, resp) => {
  try {
    // Get role-specific complaint types based on user role
    const userRole = user.roles && user.roles.length > 0 ? user.roles[0] : null;
    const success = findComplainTypes(userRole);
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to fetch complain types';
      return resp;
    }

    resp.data = success;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'Something went wrong';
    return resp;
  }
};

export const getBookingIds = async (user, resp) => {
  try {
    const success = await findBookingIds(user);
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to fetch booking ids';
      return resp;
    }

    resp.data = success;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'Something went wrong';
    return resp;
  }
};

export const createComplainTicket = async (
  user,
  { type, bookingId, text },
  files,
  resp,
) => {
  try {
    let uploadedUrls = [];

    if (files && files.length > 0) {
      for (const file of files) {
        if (file.buffer && file.mimetype) {
          try {
            let url;
            if (user.roles.includes('driver')) {
              url = await uploadDriverImage(user.id, file);
            } else if (user.roles.includes('passenger')) {
              url = await uploadPassengerImage(user.id, file);
            }
            uploadedUrls.push(url);
          } catch (uploadError) {
            resp.error = true;
            resp.error_message = `❌ S3 upload failed: ${uploadError.message}`;
            return resp;
          }
        }
      }
    }

    const booking = await findRideByRideId(bookingId);
    if (!booking) {
      resp.error = true;
      resp.error_message = 'Failed to find booking';
      return resp;
    }

    const success = await createComplain({
      user,
      bookingId: booking._id,
      text,
      type,
      attachments: uploadedUrls,
    });
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to create complaint';
      return resp;
    }

    // Send admin notification when complaint is created
    const notify = await createAdminNotification({
      title: 'New Support Ticket Submitted',
      message: `A ${user.roles[0]} has submitted a support ticket.`,
      metadata: success,
      module: 'support_ticket',
      type: 'ALERT',
      actionLink: `${env.FRONTEND_URL}/api/admin/support/get?id=${success._id}`,
    });
    if (!notify) {
      console.error('Failed to send admin notification');
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

export const getAllComplainTickets = async (user, { page, limit }, resp) => {
  try {
    const result = await findComplains(user.id, { page, limit });
    if (!result.complains) {
      resp.error = true;
      resp.error_message = 'No complains found.';
      return resp;
    }

    resp.data = result;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'something went wrong';
    return resp;
  }
};

export const getComplainTicketById = async (user, { id }, resp) => {
  try {
    const success = await findComplainById(id);
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to find complain';
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

export const replySupportChat = async (user, { id }, { text }, files, resp) => {
  try {
    let uploadedUrls = [];

    if (files && files.length > 0) {
      for (const file of files) {
        if (file.buffer && file.mimetype) {
          try {
            let url;
            if (user.roles.includes('driver')) {
              url = await uploadDriverImage(user.id, file);
            } else if (user.roles.includes('passenger')) {
              url = await uploadPassengerImage(user.id, file);
            }
            uploadedUrls.push(url);
          } catch (uploadError) {
            resp.error = true;
            resp.error_message = `❌ S3 upload failed: ${uploadError.message}`;
            return resp;
          }
        }
      }
    }

    if (text.trim() === '' && uploadedUrls.length <= 0) {
      resp.error = true;
      resp.error_message = 'Empty messages are not allowed';
      return resp;
    }

    const success = await sendReplySupportChat(id, text, uploadedUrls);
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to reply support';
      return resp;
    }

    const notify = await createAdminNotification({
      title: 'Support Ticket Reply',
      message: `A ${user.roles[0]} has replied to a support ticket.`,
      metadata: success,
      module: 'support_ticket',
      type: 'ALERT',
      actionLink: `${env.FRONTEND_URL}/api/admin/support/get?id=${success._id}`,
    });
    if (!notify) {
      console.error('Failed to send notification');
    }

    resp.data = success;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message;
    return resp;
  }
};
