import cron from 'node-cron';
import Ride from '../models/Ride.js';
import Driver from '../models/Driver.js';
import PromoCode from '../models/promo_code.js';

import env from '../config/envConfig.js';
import { createAdminNotification, notifyUser } from '../dal/notification.js';

// Helper function to determine missing fields
const getMissingFields = (driver) => {
  const missingFields = [];

  // Check vehicle information
  if (!driver.vehicle?.type) missingFields.push('Vehicle Type');
  if (!driver.vehicle?.model) missingFields.push('Vehicle Model');
  if (!driver.vehicle?.plateNumber) missingFields.push('License Plate');
  if (!driver.vehicle?.color) missingFields.push('Vehicle Color');
  if (!driver.vehicle?.imageUrl) missingFields.push('Vehicle Photo');

  // Check documents
  if (
    !driver.documents?.profilePicture?.imageUrl ||
    driver.documents?.profilePicture?.imageUrl.trim() === ''
  )
    missingFields.push('Profile Picture');
  if (
    !driver.documents?.driversLicense?.imageUrl ||
    driver.documents?.driversLicense?.imageUrl.trim() === ''
  )
    missingFields.push('Driver License');
  if (
    !driver.documents?.commercialDrivingRecord?.imageUrl ||
    driver.documents?.commercialDrivingRecord?.imageUrl.trim() === ''
  )
    missingFields.push('Commercial Driving Record');
  if (
    !driver.documents?.vehicleOwnerCertificateAndInsurance?.imageUrl ||
    driver.documents?.vehicleOwnerCertificateAndInsurance?.imageUrl.trim() ===
      ''
  )
    missingFields.push('Vehicle Insurance');
  if (
    !driver.documents?.vehicleInspection?.imageUrl ||
    driver.documents?.vehicleInspection?.imageUrl.trim() === ''
  )
    missingFields.push('Vehicle Inspection');

  // Check waybill documents
  if (
    !driver.wayBill?.certificateOfInsurance?.imageUrl ||
    driver.wayBill?.certificateOfInsurance?.imageUrl.trim() === ''
  )
    missingFields.push('Certificate of Insurance');
  if (
    !driver.wayBill?.recordCheckCertificate?.imageUrl ||
    driver.wayBill?.recordCheckCertificate?.imageUrl.trim() === ''
  )
    missingFields.push('Record Check Certificate');

  // Check payment methods
  if (!driver.payoutMethodIds || driver.payoutMethodIds.length === 0)
    missingFields.push('Payout Methods');
  if (!driver.defaultAccountId) missingFields.push('Default Payment Method');

  // Check legal agreement
  if (!driver.legalAgreement) missingFields.push('Legal Agreement');

  return missingFields;
};

// Helper function to calculate profile completion percentage
const calculateProfileCompletion = (driver) => {
  const totalFields = 14; // Total number of fields to check
  const completedFields = totalFields - getMissingFields(driver).length;
  return Math.round((completedFields / totalFields) * 100);
};

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
const frequentCancellationJob = await createCronJob(
  '0 2 * * *',
  async () => {
    try {
      // Find drivers who cancelled more than once today
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      console.log(
        `🔍 Checking driver cancellations for: ${today.toISOString()}`,
      );

      const frequentCancellers = await Ride.aggregate([
        {
          $match: {
            status: 'CANCELLED_BY_DRIVER',
            createdAt: { $gte: today, $lt: tomorrow },
            driverId: { $exists: true, $ne: null }, // Ensure driverId exists
          },
        },
        {
          $lookup: {
            from: 'drivers', // Adjust collection name as needed
            localField: 'driverId',
            foreignField: '_id',
            as: 'driverInfo',
          },
        },
        {
          $unwind: {
            path: '$driverInfo',
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $group: {
            _id: '$driverId',
            cancelCount: { $sum: 1 },
            driverName: {
              $first: {
                $cond: {
                  if: { $and: ['$driverInfo', '$driverInfo.name'] },
                  then: '$driverInfo.name',
                  else: 'Unknown Driver',
                },
              },
            },
            driverEmail: {
              $first: {
                $cond: {
                  if: { $and: ['$driverInfo', '$driverInfo.email'] },
                  then: '$driverInfo.email',
                  else: 'No Email',
                },
              },
            },
            rides: { $push: '$$ROOT' },
          },
        },
        {
          $match: {
            cancelCount: { $gt: 1 }, // More than 1 cancellation
          },
        },
        {
          $sort: { cancelCount: -1 }, // Highest cancellations first
        },
      ]);

      console.log(
        `📊 Found ${frequentCancellers.length} drivers with multiple cancellations`,
      );

      let successfulNotifications = 0;
      let failedNotifications = 0;

      // Send warning to each frequent canceller
      for (const driver of frequentCancellers) {
        try {
          const driverName = driver.driverName || 'Unknown Driver';
          const driverId = driver._id?.toString();

          if (!driverId) {
            console.log('❌ Skipping driver with invalid ID');
            failedNotifications++;
            continue;
          }

          const notify = await createAdminNotification({
            title: 'Multiple Ride Cancellations',
            message: `Driver "${driverName}" has cancelled ${driver.cancelCount} rides today. Please review their activity.`,
            metadata: {
              driverId: driverId,
              driverName: driverName,
              driverEmail: driver.driverEmail,
              cancelCount: driver.cancelCount,
              date: today.toISOString().split('T')[0],
              rideIds: driver.rides
                .map((ride) => ride._id?.toString())
                .filter((id) => id),
            },
            module: 'booking_management',
            type: 'ALERT',
            actionLink: `${env.BASE_URL}in/drivers/fetch/${driverId}`, // Frontend page, not API
          });

          if (notify) {
            successfulNotifications++;
            console.log(
              `✅ Notification sent for driver: ${driverName} (${driver.cancelCount} cancellations)`,
            );
          } else {
            failedNotifications++;
            console.error(
              `❌ Failed to send notification for driver: ${driverName}`,
            );
          }
        } catch (driverError) {
          failedNotifications++;
          console.error(
            `❌ Error processing driver ${driver._id}:`,
            driverError,
          );
        }
      }

      console.log(
        `✅ Daily driver warning check completed. ${successfulNotifications} successful, ${failedNotifications} failed.`,
      );

      // Log summary for monitoring
      if (frequentCancellers.length > 0) {
        console.log('📋 Summary of drivers with multiple cancellations:');
        frequentCancellers.forEach((driver) => {
          console.log(
            `   - ${driver.driverName}: ${driver.cancelCount} cancellations`,
          );
        });
      }
    } catch (error) {
      console.error('❌ Error in driver warning cron job:', error);
    }
  },
  'Driver Warning',
);

const suspensionCheckingJob = await createCronJob(
  '0 2 * * *', // runs daily at 2 AM
  async () => {
    try {
      const now = new Date();

      // Find all drivers currently suspended whose latest suspension has expired
      const suspendedDrivers = await Driver.find({
        isSuspended: true,
        'suspensions.end': { $lte: now },
      }).lean();

      if (suspendedDrivers.length === 0) {
        console.log('✅ No drivers to unsuspend today.');
        return;
      }

      for (const driver of suspendedDrivers) {
        // Find the latest suspension
        const latestSuspension =
          driver.suspensions[driver.suspensions.length - 1];

        // If it’s expired or ends today, unsuspend
        if (latestSuspension && new Date(latestSuspension.end) <= now) {
          const success = await Driver.findByIdAndUpdate(
            driver._id,
            {
              $set: { status: 'offline', isActive: false, isSuspended: false },
            },
            { new: true },
          ).lean();
          if (!success) {
            console.log(`Failed to unsuspend driver: ${driver.uniqueId}`);
          } else if (success.isSuspended) {
            const notify = await createAdminNotification({
              title: 'Failed Removing Driver Unsuspension',
              message: `System failed to remove suspension from a driver ${success.userId.name}`,
              metadata: {},
              module: 'booking_management',
              type: 'ALERT',
              actionLink: `${env.BASE_URL}/admin/drivers/fetch/${success._id}`,
            });
            if (!notify) {
              console.log(`Failed to notify admin`);
            }
          }
          console.log(`Unsuspended driver ${driver._id}`);
        }
      }

      console.log(`Total drivers unsuspended: ${suspendedDrivers.length}`);
    } catch (error) {
      console.error('Error in driver suspension check job:', error);
    }
  },
  'Driver Suspension Auto-Check',
);

const checkIncompleteProfileJob = await createCronJob(
  '0 2 */2 * *', // Runs every 2 days at 2 AM
  async () => {
    try {
      // Calculate date 2 days ago
      const twoDaysAgo = new Date();
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
      twoDaysAgo.setHours(0, 0, 0, 0);

      console.log(
        `🔍 Checking driver profiles created before: ${twoDaysAgo.toISOString()}`,
      );

      // Find drivers created more than 2 days ago with incomplete profiles
      const incompleteDrivers = await Driver.find({
        createdAt: { $lte: twoDaysAgo },
        $or: [
          // Check for missing vehicle information
          { 'vehicle.type': { $in: [null, undefined, ''] } },
          { 'vehicle.model': { $in: [null, undefined, ''] } },
          { 'vehicle.plateNumber': { $in: [null, undefined, ''] } },
          { 'vehicle.color': { $in: [null, undefined, ''] } },
          { 'vehicle.imageUrl': { $in: [null, undefined, ''] } },

          // Check for missing documents
          {
            'documents.profilePicture.imageUrl': { $in: [null, undefined, ''] },
          },
          {
            'documents.driversLicense.imageUrl': { $in: [null, undefined, ''] },
          },
          {
            'documents.commercialDrivingRecord.imageUrl': {
              $in: [null, undefined, ''],
            },
          },
          {
            'documents.vehicleOwnerCertificateAndInsurance.imageUrl': {
              $in: [null, undefined, ''],
            },
          },
          {
            'documents.vehicleInspection.imageUrl': {
              $in: [null, undefined, ''],
            },
          },

          // Check for missing waybill documents
          {
            'wayBill.certificateOfInsurance.imageUrl': {
              $in: [null, undefined, ''],
            },
          },
          {
            'wayBill.recordCheckCertificate.imageUrl': {
              $in: [null, undefined, ''],
            },
          },

          // Check for missing payment methods
          { payoutMethodIds: { $size: 0 } },
          { defaultAccountId: { $in: [null, undefined, ''] } },

          // Check legal agreement
          { legalAgreement: { $ne: true } },
        ],
      }).populate('userId', 'name email phone'); // Populate user details for notification

      console.log(
        `📊 Found ${incompleteDrivers.length} drivers with incomplete profiles`,
      );

      let notificationsSent = 0;
      let notificationsFailed = 0;

      // Send notifications to each incomplete driver
      for (const driver of incompleteDrivers) {
        try {
          const user = driver.userId;
          if (!user) {
            console.log(`❌ Skipping driver ${driver._id} - user not found`);
            continue;
          }

          // Determine what's missing for the specific message
          const missingFields = getMissingFields(driver);

          const notification = await notifyUser({
            driverId: driver._id,
            title: 'Complete Your Profile',
            message: `Please complete your driver profile. Missing: ${missingFields.join(', ')}`,
            module: 'support',
            metadata: {
              missingFields: missingFields,
              profileCompletionPercentage: calculateProfileCompletion(driver),
              createdAt: driver.createdAt,
              reminderCount: (driver.profileReminderCount || 0) + 1,
            },
            actionLink: `${env.BASE_URL}/user/profile/me`,
          });

          if (notification) {
            notificationsSent++;

            // Update driver's reminder count
            await Driver.findByIdAndUpdate(driver._id, {
              $inc: { profileReminderCount: 1 },
              lastProfileReminder: new Date(),
            });

            console.log(
              `✅ Notification sent to ${user.name || user.email} - Missing: ${missingFields.join(', ')}`,
            );
          } else {
            notificationsFailed++;
            console.error(
              `❌ Failed to send notification to ${user.name || user.email}`,
            );
          }
        } catch (driverError) {
          notificationsFailed++;
          console.error(
            `❌ Error processing driver ${driver._id}:`,
            driverError,
          );
        }
      }

      console.log(
        `✅ Profile completion check completed. ${notificationsSent} notifications sent, ${notificationsFailed} failed.`,
      );

      // Log summary for monitoring
      if (incompleteDrivers.length > 0) {
        console.log('📋 Summary of incomplete profiles:');
        incompleteDrivers.forEach((driver) => {
          const user = driver.userId;
          const missingFields = getMissingFields(driver);
          console.log(
            `   - ${user?.name || user?.email || driver._id}: ${missingFields.length} missing fields`,
          );
        });
      }
    } catch (error) {
      console.error('❌ Error in driver profile completion check job:', error);
    }
  },
  'Driver Profile Completion Auto-Check',
);

const promoCodeExpiryJob = await createCronJob(
  '0 3 * * *', // runs daily at 3 AM
  async () => {
    try {
      const now = new Date();

      // Find all active promo codes whose end date has passed
      const expiredPromoCodes = await PromoCode.find({
        isActive: true,
        endsAt: { $lte: now },
      }).lean();

      if (expiredPromoCodes.length === 0) {
        console.log('No promo codes to deactivate today.');
        return;
      }

      // Deactivate all expired promo codes in bulk
      const result = await PromoCode.updateMany(
        { _id: { $in: expiredPromoCodes.map((p) => p._id) } },
        { $set: { isActive: false } },
      );

      console.log(
        `Deactivated ${result.modifiedCount} expired promo code(s):`,
        expiredPromoCodes.map((p) => p.code).join(', '),
      );
    } catch (error) {
      console.error('Error in promo code expiry job:', error);
    }
  },
  'Promo Code Auto-Deactivation',
);

// To stop any job later:
// job.stop();

// Export if needed
export default {
  frequentCancellationJob,
  suspensionCheckingJob,
  checkIncompleteProfileJob,
  promoCodeExpiryJob,
};
