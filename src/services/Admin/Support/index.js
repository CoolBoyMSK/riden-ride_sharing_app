import {
  getAllComplainTickets,
  findComplainById,
  updateComplaniStatusById,
  adminComplainReply,
  getAllReports,
  findReportById,
  updateReportStatusById,
} from '../../../dal/support.js';
import { uploadAdminImage } from '../../../utils/s3Uploader.js';
import { createAdminNotification } from '../../../dal/notification.js';
import env from '../../../config/envConfig.js';

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
    resp.error_message = error.message || 'something went wrong';
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
    resp.error_message = error.message || 'something went wrong';
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
    resp.error_message = error.message || 'something went wrong';
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

    // Create admin notification for support ticket reply
    const notify = await createAdminNotification({
      title: 'Support Ticket Reply Sent',
      message: `You replied to a support ticket. User will be notified.`,
      metadata: success,
      module: 'support_ticket',
      type: 'ALERT',
      actionLink: `${env.FRONTEND_URL}/api/admin/support/get?id=${success._id}`,
    });
    
    if (!notify || !notify.success) {
      console.error('Failed to create admin notification for support reply:', notify);
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

export const findAllReports = async (
  user,
  { type, page, limit, search, fromDate, toDate },
  resp,
) => {
  try {
    const success = await getAllReports({
      type,
      page,
      limit,
      search,
      fromDate,
      toDate,
    });
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to fetch reports';
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

export const getReportById = async (user, { id }, resp) => {
  try {
    const success = await findReportById(id);
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to fetch report';
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

export const updateReportStatus = async (user, { id, status }, resp) => {
  try {
    const success = await updateReportStatusById(id, status);
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
    resp.error_message = error.message || 'something went wrong';
    return resp;
  }
};
