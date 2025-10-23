import cron from 'node-cron';
import Ride from '../models/Ride.js';

import { createAdminNotification } from '../dal/notification.js';

// Simple cron job function
const createCronJob = async (schedule, taskFunction, jobName = 'My Job') => {
  console.log(`🕐 Scheduling: ${jobName} - ${schedule}`);

  const task = cron.schedule(schedule, () => {
    console.log(`🚀 Running: ${jobName}`);
    taskFunction();
  });

  return task;
};

// 3. Job that runs at 2 AM daily
const job = await createCronJob(
  '0 2 * * *',
  async () => {
    try {
      // Find drivers who cancelled more than once today
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const frequentCancellers = await Ride.aggregate([
        {
          $match: {
            status: 'CANCELLED_BY_DRIVER',
            createdAt: { $gte: today, $lt: tomorrow },
          },
        },
        {
          $group: {
            _id: '$driverId',
            cancelCount: { $sum: 1 },
            rides: { $push: '$$ROOT' },
          },
        },
        {
          $match: {
            cancelCount: { $gt: 1 }, // More than 1 cancellation
          },
        },
      ]);

      // Send warning to each frequent canceller
      for (const driver of frequentCancellers) {
        const notify = await createAdminNotification({
          title: 'Multiple Ride Cancellations',
          message: `A driver has multiple ride cancellations. Please review.`,
          metadata: frequentCancellers,
          module: 'booking_management',
          type: 'ALERT',
          actionLink: `${env.FRONTEND_URL}/api/admin/bookings/${frequentCancellers}`,
        });
        if (!notify) {
          console.error('Failed to send notification');
        }
      }

      console.log(
        `✅ Daily driver warning check completed. ${frequentCancellers.length} drivers warned.`,
      );
    } catch (error) {
      console.error('❌ Error in driver warning cron job:', error);
    }
  },
  'Driver Warning',
);

// To stop any job later:
// job.stop();

// Export if needed
export { createCronJob, job };
