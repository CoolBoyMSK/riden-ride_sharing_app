import {
  createAlert,
  findAllPassengers,
  findAllDrivers,
  findAllAlerts,
  deleteAlertById,
  sendAlert as processAlert,
} from '../../../dal/admin/index.js';
import { alertQueue } from '../../../queues/alertQueue.js';
import env from '../../../config/envConfig.js';

export const sendAlert = async (
  user,
  { audience, recipients, blocks },
  resp,
) => {
  try {
    // If recipients are provided, automatically set audience to 'custom'
    const finalAudience = recipients && recipients.length > 0 ? 'custom' : audience;
    const alert = await createAlert({ user, audience: finalAudience, recipients, blocks });
    if (!alert) {
      resp.error = true;
      resp.error_message = 'Failed to create alert';
      return resp;
    }
    
    console.log(`📤 [ALERT] Alert created with ID: ${alert._id}, Audience: ${finalAudience}, Blocks: ${blocks?.length || 0}`);
    
    // Check if worker process is running by checking queue connection
    // If worker is not running, process synchronously as fallback
    const useSynchronousProcessing = env.ALERT_SYNC_PROCESSING === 'true' || false;
    
    if (useSynchronousProcessing) {
      console.log(`⚡ [ALERT] Processing alert synchronously (worker fallback mode)...`);
      try {
        await processAlert(alert._id.toString());
        console.log(`✅ [ALERT] Alert ${alert._id} processed successfully (synchronous mode)`);
      } catch (error) {
        console.error(`❌ [ALERT] Error processing alert synchronously:`, error);
        // Don't fail the request, just log the error
      }
    } else {
      console.log(`📤 [ALERT] Queueing alert for worker processing...`);
      await alertQueue.add(
        'send-alert',
        { alertId: alert._id.toString() },
        {
          attempts: Number(env.JOB_ATTEMPTS || 5),
          backoff: {
            type: 'exponential',
            delay: Number(env.JOB_BACKOFF_MS || 2000),
          },
          removeOnComplete: true,
        },
      );
      console.log(`✅ [ALERT] Alert ${alert._id} queued successfully. Worker will process it shortly.`);
    }
    
    resp.data = alert;
    return resp;
  } catch (error) {
    console.error(`❌ [ALERT] API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'something went wrong';
    return resp;
  }
};

export const getAllPassengers = async (resp) => {
  try {
    const success = await findAllPassengers();
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to find passengers';
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

export const getAllDrivers = async (resp) => {
  try {
    const success = await findAllDrivers();
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to find drivers';
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

export const getAllAlerts = async (
  { page, limit, fromDate, toDate, search },
  resp,
) => {
  try {
    const success = await findAllAlerts({
      page,
      limit,
      fromDate,
      toDate,
      search,
    });
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to fetch alerts';
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

export const deleteAlert = async (user, { id }, resp) => {
  try {
    const result = await deleteAlertById(id, user._id);
    if (!result.success) {
      resp.error = true;
      resp.error_message = result.message || 'Failed to delete alert';
      return resp;
    }

    resp.data = result.data;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'something went wrong';
    return resp;
  }
};
