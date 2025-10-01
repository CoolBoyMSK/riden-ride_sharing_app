import {
  createAlert,
  findAllPassengers,
  findAllDrivers,
  findAllAlerts,
} from '../../../dal/admin/index.js';
import { alertQueue } from '../../../queues/alertQueue.js';
import env from '../../../config/envConfig.js';

export const sendAlert = async (
  user,
  { audience, recipients, blocks },
  resp,
) => {
  try {
    const alert = await createAlert({ user, audience, recipients, blocks });
    if (!alert) {
      resp.error = true;
      resp.error_message = 'Failed to create alert';
      return resp;
    }
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
    resp.data = alert;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
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
