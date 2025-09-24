import {
  getAllComplainTickets,
  findComplainById,
  updateComplaniStatusById,
  adminComplainReply,
} from '../../../dal/support.js';
import { uploadAdminImage } from '../../../utils/s3Uploader.js';

export const findAllComplainTickets = async (
  user,
  { category, page, limit, search, fromDate, toDate },
  resp,
) => {
  try {
    const success = await getAllComplainTickets({
      category,
      page,
      limit,
      search,
      fromDate,
      toDate,
    });
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to fetch complain tickets';
      return resp;
    }

    resp.data = success;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = 'Something went wrong while fetching complain tickets';
    return resp;
  }
};

export const getComplainById = async (user, { id }, resp) => {
  try {
    const success = await findComplainById(id);
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to fetch complain ticket';
      return resp;
    }

    resp.data = success;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = 'Something went wrong while fetching complain ticket';
    return resp;
  }
};

export const updateComplainStatus = async (user, { id, status }, resp) => {
  try {
    const success = await updateComplaniStatusById(id, status);
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to fetch update status';
      return resp;
    }

    resp.data = success;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = 'Something went wrong while updating complain status';
    return resp;
  }
};

export const replyToComplain = async (user, { id }, { text }, files, resp) => {
  try {
    let uploadedUrls = [];

    if (files && files.length > 0) {
      for (const file of files) {
        if (file.buffer && file.mimetype) {
          try {
            let url = await uploadAdminImage(user.id, file);
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

    const success = await adminComplainReply(id, text, uploadedUrls);
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to fetch update status';
      return resp;
    }

    resp.data = success;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = 'Something went wrong while updating complain status';
    return resp;
  }
};
