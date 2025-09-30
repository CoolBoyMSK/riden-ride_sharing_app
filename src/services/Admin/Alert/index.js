import { createAlert } from '../../../dal/admin/index.js';
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
