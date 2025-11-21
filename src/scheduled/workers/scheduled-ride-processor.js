import { Worker } from 'bullmq';
import { scheduledRideQueue } from '../queues/index.js';
import logger from '../lib/logger.js';
import { findRideById, updateRideById } from '../../dal/ride.js';
import { notifyUser } from '../../dal/notification.js';
import { emitToUser } from '../../realtime/socket.js';

const concurrency = 5; // Process multiple scheduled rides concurrently

export const startScheduledRideProcessor = () => {
  const worker = new Worker(
    'scheduled-ride-queue',
    async (job) => {
      const { rideId, jobType } = job.data;
      logger.info('Processing scheduled ride job', {
        jobId: job.id,
        rideId,
        jobType,
      });

      try {
        const ride = await findRideById(rideId);
        if (!ride) {
          logger.warn('Ride not found', { rideId });
          return { status: 'skipped', reason: 'ride_not_found' };
        }

        // Check if ride is still scheduled (might have been cancelled)
        if (
          ride.status !== 'SCHEDULED' &&
          ride.status !== 'DRIVER_ASSIGNED' &&
          ride.status !== 'CANCELLED_BY_SYSTEM' &&
          ride.status !== 'CANCELLED_BY_PASSENGER' &&
          ride.status !== 'CANCELLED_BY_DRIVER'
        ) {
          logger.info('Ride is no longer scheduled', {
            rideId,
            currentStatus: ride.status,
          });
          return { status: 'skipped', reason: 'ride_not_scheduled' };
        }

        switch (jobType) {
          case 'send_notification':
            await handleScheduledRideNotification(ride);
            break;
          case 'activate_ride':
            await handleScheduledRide(ride);
            break;
          case 'cancel_if_no_response':
            await handleCancelScheduledRideIfNoResponse(ride);
            break;
          default:
            logger.warn('Unknown job type', { jobType, rideId });
        }

        return { status: 'completed', jobType, rideId };
      } catch (error) {
        logger.error('Error processing scheduled ride job', {
          jobId: job.id,
          rideId,
          jobType,
          error: error.message,
        });
        throw error;
      }
    },
    {
      connection: scheduledRideQueue.connection,
      concurrency,
    },
  );

  worker.on('completed', (job) => {
    logger.info('Scheduled ride job completed', {
      jobId: job.id,
      rideId: job.data.rideId,
      jobType: job.data.jobType,
    });
  });

  worker.on('failed', (job, err) => {
    logger.error('Scheduled ride job failed', {
      jobId: job?.id,
      rideId: job?.data?.rideId,
      jobType: job?.data?.jobType,
      error: err.message,
    });
  });

  logger.info('Scheduled ride processor started');
  return worker;
};

// Send notification to passenger and driver (if assigned) before scheduled time
const handleScheduledRideNotification = async (ride) => {
  try {
    const scheduledTime = new Date(ride.scheduledTime);
    const now = new Date();
    const minutesUntilRide = Math.floor((scheduledTime - now) / (1000 * 60));

    // Notify passenger
    const passengerMessage =
      minutesUntilRide > 0
        ? `Your scheduled ride is in ${minutesUntilRide} minute(s). Please be ready at the pickup location.`
        : 'Your scheduled ride is about to start. Please be ready at the pickup location.';

    await notifyUser({
      userId: ride.passengerId?.userId,
      title: 'Scheduled Ride Reminder',
      message: passengerMessage,
      module: 'ride',
      metadata: ride,
    });

    // Notify driver if already assigned
    if (ride.driverId?.userId) {
      const driverMessage =
        minutesUntilRide > 0
          ? `You have a scheduled ride in ${minutesUntilRide} minute(s). Please be ready.`
          : 'Your scheduled ride is about to start. Please proceed to the pickup location.';

      await notifyUser({
        userId: ride.driverId.userId,
        title: 'Scheduled Ride Reminder',
        message: driverMessage,
        module: 'ride',
        metadata: ride,
      });
    }

    logger.info('Scheduled ride notification sent', {
      rideId: ride._id,
      minutesUntilRide,
    });
  } catch (error) {
    logger.error('Error sending scheduled ride notification', {
      rideId: ride._id,
      error: error.message,
    });
    throw error;
  }
};

// Activate scheduled ride: change status to REQUESTED and start driver search
const handleScheduledRide = async (ride) => {
  try {
    if (!ride.driverId) {
      await notifyUser({
        userId: ride.passengerId?.userId,
        title: 'No Driver Assigned',
        message: `No driver assigned to the ride you have scheduled. Please try again later.`,
        module: 'ride',
        metadata: ride,
        type: 'ALERT',
      });
      throw new Error('No driver assigned to the ride');
    }

    if (ride.driverId.status !== 'online') {
      await notifyUser({
        userId: ride.passengerId?.userId,
        title: 'No Driver Available',
        message: `The assigned driver is not available to accept the ride. Please try again later.`,
        module: 'ride',
        metadata: ride,
        type: 'ALERT',
      });
      throw new Error(
        'The assigned driver is not available to accept the ride',
      );
    }

    // if (ride.passengerId) {
    //   await notifyUser({
    //     userId: ride.passengerId?.userId,
    //     title: 'Passenger Not Available',
    //     message: `The passenger is already on another ride. Please try again later.`,
    //     module: 'ride',
    //     metadata: ride,
    //     type: 'ALERT',
    //   });
    //   throw new Error('The passenger is already on another ride');
    // }

    // Update ride status to DRIVER_ARRIVING
    const updatedRide = await updateRideById(ride._id, {
      status: 'DRIVER_ARRIVING',
      driverArrivingAt: new Date(),
    });

    if (!updatedRide) {
      throw new Error('Failed to update ride status');
    }

    // Notify passenger that ride is now active
    await notifyUser({
      userId: ride.passengerId?.userId,
      title: 'Scheduled Ride Activated',
      message:
        'Your scheduled ride is now active, the driver is on the way to pick you up.',
      module: 'ride',
      metadata: updatedRide,
    });

    logger.info('Scheduled ride activated', { rideId: ride._id });
  } catch (error) {
    logger.error('Error activating scheduled ride', {
      rideId: ride._id,
      error: error.message,
    });
    throw error;
  }
};

// Cancel scheduled ride if no response from driver and passenger after scheduled time + 5 minutes
const handleCancelScheduledRideIfNoResponse = async (ride) => {
  try {
    const currentRide = await findRideById(ride._id);

    if (!currentRide) {
      logger.warn('Ride not found for cancellation check', {
        rideId: ride._id,
      });
      return;
    }

    // If ride has been cancelled, completed, or driver assigned, don't cancel
    if (
      currentRide.status === 'CANCELLED_BY_PASSENGER' ||
      currentRide.status === 'CANCELLED_BY_DRIVER' ||
      currentRide.status === 'CANCELLED_BY_SYSTEM' ||
      currentRide.status === 'RIDE_STARTED' ||
      currentRide.status === 'RIDE_IN_PROGRESS' ||
      currentRide.status === 'RIDE_COMPLETED' ||
      currentRide.status === 'DRIVER_ARRIVING' ||
      currentRide.status === 'DRIVER_ARRIVED'
    ) {
      logger.info('Ride already processed, skipping cancellation', {
        rideId: ride._id,
        status: currentRide.status,
      });
      return;
    }

    if (
      currentRide.status !== 'SCHEDULED' &&
      currentRide.status !== 'DRIVER_ASSIGNED'
    ) {
      logger.info('Ride status changed, skipping cancellation', {
        rideId: ride._id,
        status: currentRide.status,
      });
      return;
    }

    // Cancel the ride
    const cancelledRide = await updateRideById(ride._id, {
      status: 'CANCELLED_BY_SYSTEM',
      cancelledBy: 'system',
      cancellationReason:
        'Ride cancelled automatically due to no response from driver and passenger after scheduled time',
      paymentStatus: 'CANCELLED',
      cancelledAt: new Date(),
    });

    // Notify passenger
    await notifyUser({
      userId: ride.passengerId?.userId,
      title: 'Scheduled Ride Cancelled',
      message:
        'Your scheduled ride has been cancelled automatically due to no response.',
      module: 'ride',
      metadata: cancelledRide,
    });

    logger.info('Scheduled ride cancelled due to no response', {
      rideId: ride._id,
    });
  } catch (error) {
    logger.error('Error cancelling scheduled ride', {
      rideId: ride._id,
      error: error.message,
    });
    throw error;
  }
};
