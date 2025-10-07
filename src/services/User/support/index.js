import { findRideByRideId } from '../../../dal/ride.js';
import {
  findComplainTypes,
  createComplain,
  findComplains,
  findComplainById,
  sendReplySupportChat,
} from '../../../dal/support.js';
import {
  uploadPassengerImage,
  uploadDriverImage,
} from '../../../utils/s3Uploader.js';

export const getComplainTypes = async (user, resp) => {
  try {
    const success = findComplainTypes();
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

    resp.data = success;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message;
    return resp;
  }
};
