import { Worker } from 'bullmq';
import { scheduledRideQueue } from '../queues/index.js';
import logger from '../lib/logger.js';
import {
  findRideById,
  updateRideById,
  findActiveRideByPassenger,
} from '../../dal/ride.js';
import { notifyUser } from '../../dal/notification.js';
import { emitToUser } from '../../realtime/socket.js';
import {
  cancelPaymentHold,
  partialRefundPaymentHold,
} from '../../dal/stripe.js';
import { startProgressiveDriverSearch } from '../../dal/driver.js';
import IORedis from 'ioredis';
import env from '../../config/envConfig.js';

const concurrency = 5; // Process multiple scheduled rides concurrently

// Create Redis connection for worker (must match queue connection)
const redisConnection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

// Test Redis connection
redisConnection.on('connect', () => {
  logger.info('✅ Redis connected for scheduled ride worker');
});

redisConnection.on('error', (error) => {
  logger.error('❌ Redis connection error:', error);
});

redisConnection.on('ready', () => {
  logger.info('✅ Redis ready for scheduled ride worker');
});

// Helper function to cancel payment hold and update ride status
const cancelRideWithPaymentHold = async (
  rideId,
  paymentIntentId,
  cancellationReason,
  notificationTitle,
  notificationMessage,
  passengerId,
) => {
  // Cancel payment hold if payment intent exists
  if (paymentIntentId) {
    try {
      const cancelResult = await cancelPaymentHold(paymentIntentId);
      if (!cancelResult.success) {
        logger.error('Failed to cancel payment hold for scheduled ride', {
          rideId,
          paymentIntentId,
          error: cancelResult.error,
        });
      } else {
        logger.info('Payment hold cancelled for scheduled ride', {
          rideId,
          paymentIntentId,
        });
      }
    } catch (cancelError) {
      logger.error('Error cancelling payment hold for scheduled ride', {
        rideId,
        paymentIntentId,
        error: cancelError.message,
      });
    }
  }

  // Update ride status to cancelled
  const cancelledRide = await updateRideById(rideId, {
    status: 'CANCELLED_BY_SYSTEM',
    cancelledBy: 'system',
    cancellationReason,
    paymentStatus: 'CANCELLED',
    cancelledAt: new Date(),
  });

  // Notify passenger if passengerId is provided
  if (passengerId) {
    await notifyUser({
      userId: passengerId,
      title: notificationTitle,
      message: notificationMessage,
      module: 'ride',
      metadata: cancelledRide,
      type: 'ALERT',
    });
  }

  return cancelledRide;
};

export const startScheduledRideProcessor = () => {
  const queueName = 'scheduled-ride-queue';
  const prefix = env.QUEUE_PREFIX || 'riden';

  logger.info('🚀 Starting scheduled ride processor', {
    queueName,
    prefix,
    concurrency,
    redisUrl: env.REDIS_URL ? 'configured' : 'missing',
  });

  const worker = new Worker(
    queueName,
    async (job) => {
      const { rideId, jobType } = job.data;

      logger.info('📥 Job received by worker', {
        jobId: job.id,
        rideId,
        jobType,
        timestamp: new Date().toISOString(),
      });

      try {
        const ride = await findRideById(rideId);
        if (!ride) {
          logger.warn('Ride not found', { rideId });
          return { status: 'skipped', reason: 'ride_not_found' };
        }

        logger.info('Processing scheduled ride job', {
          rideId,
          jobType,
          rideStatus: ride.status,
          isScheduledRide: ride.isScheduledRide,
          scheduledTime: ride.scheduledTime,
        });

        // Check if ride is still scheduled based on job type
        let shouldProcess = false;
        switch (jobType) {
          case 'send_notification':
            // Only process if ride is SCHEDULED or DRIVER_ASSIGNED
            shouldProcess =
              ride.status === 'SCHEDULED' || ride.status === 'DRIVER_ASSIGNED';
            break;
          case 'activate_ride':
            // Only process if ride is SCHEDULED or DRIVER_ASSIGNED
            shouldProcess =
              ride.status === 'SCHEDULED' || ride.status === 'DRIVER_ASSIGNED';
            break;
          case 'cancel_if_no_response':
            // Process if ride is in any of these states
            shouldProcess =
              ride.status === 'SCHEDULED' ||
              ride.status === 'DRIVER_ASSIGNED' ||
              ride.status === 'DRIVER_ARRIVING' ||
              ride.status === 'DRIVER_ARRIVED';
            break;
          default:
            logger.warn('Unknown job type', { jobType, rideId });
            return { status: 'skipped', reason: 'unknown_job_type' };
        }

        // Skip if ride has been cancelled or completed
        if (
          ride.status === 'CANCELLED_BY_SYSTEM' ||
          ride.status === 'CANCELLED_BY_PASSENGER' ||
          ride.status === 'CANCELLED_BY_DRIVER' ||
          ride.status === 'RIDE_COMPLETED' ||
          ride.status === 'RIDE_STARTED' ||
          ride.status === 'RIDE_IN_PROGRESS'
        ) {
          logger.info('Ride already processed or cancelled', {
            rideId,
            currentStatus: ride.status,
            jobType,
          });
          return { status: 'skipped', reason: 'ride_already_processed' };
        }

        if (!shouldProcess) {
          logger.info('Ride status does not allow processing this job', {
            rideId,
            currentStatus: ride.status,
            jobType,
          });
          return { status: 'skipped', reason: 'invalid_status_for_job' };
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

        logger.info('✅ Job processed successfully', {
          jobId: job.id,
          rideId,
          jobType,
          status: 'completed',
        });

        return { status: 'completed', jobType, rideId };
      } catch (error) {
        logger.error('❌ Error processing scheduled ride job', {
          jobId: job.id,
          rideId,
          jobType,
          error: error.message,
          stack: error.stack,
        });
        throw error;
      }
    },
    {
      connection: redisConnection,
      prefix,
      concurrency,
      removeOnComplete: {
        age: 3600, // Keep completed jobs for 1 hour
        count: 1000, // Keep max 1000 completed jobs
      },
      removeOnFail: {
        age: 24 * 3600, // Keep failed jobs for 24 hours
      },
    },
  );

  // Worker event handlers
  worker.on('ready', () => {
    logger.info('✅ Scheduled ride worker is ready and listening for jobs');
  });

  worker.on('active', (job) => {
    logger.info('🔄 Job started processing', {
      jobId: job.id,
      rideId: job.data.rideId,
      jobType: job.data.jobType,
    });
  });

  worker.on('completed', (job) => {
    logger.info('✅ Scheduled ride job completed', {
      jobId: job.id,
      rideId: job.data.rideId,
      jobType: job.data.jobType,
      processedAt: new Date().toISOString(),
    });
  });

  worker.on('failed', (job, err) => {
    logger.error('❌ Scheduled ride job failed', {
      jobId: job?.id,
      rideId: job?.data?.rideId,
      jobType: job?.data?.jobType,
      error: err.message,
      stack: err.stack,
      failedAt: new Date().toISOString(),
    });
  });

  worker.on('error', (error) => {
    logger.error('❌ Worker error:', {
      error: error.message,
      stack: error.stack,
    });
  });

  worker.on('stalled', (jobId) => {
    logger.warn('⚠️ Job stalled', { jobId });
  });

  // Log worker startup
  logger.info('✅ Scheduled ride processor started successfully', {
    queueName,
    prefix,
    concurrency,
  });

  return worker;
};

// Send notification to passenger and driver (if assigned) before scheduled time
const handleScheduledRideNotification = async (ride) => {
  try {
    logger.info('📧 Processing notification for scheduled ride', {
      rideId: ride._id,
      scheduledTime: ride.scheduledTime,
      status: ride.status,
    });

    const scheduledTime = new Date(ride.scheduledTime);
    const now = new Date();
    const minutesUntilRide = Math.floor((scheduledTime - now) / (1000 * 60));

    logger.info('⏰ Time calculation', {
      scheduledTime: scheduledTime.toISOString(),
      now: now.toISOString(),
      minutesUntilRide,
    });

    // Get passenger userId
    const passengerUserId =
      ride.passengerId?.userId?._id?.toString() ||
      ride.passengerId?.userId?.toString() ||
      ride.passengerId?.userId;

    if (!passengerUserId) {
      logger.error('❌ Cannot find passenger userId', {
        rideId: ride._id,
        passengerId: ride.passengerId,
      });
      throw new Error('Passenger userId not found');
    }

    // Notify passenger
    const passengerMessage =
      minutesUntilRide > 0
        ? `Your scheduled ride is in ${minutesUntilRide} minute(s). Please be ready at the pickup location.`
        : 'Your scheduled ride is about to start. Please be ready at the pickup location.';

    logger.info('📤 Sending notification to passenger', {
      passengerUserId,
      message: passengerMessage,
    });

    const passengerNotification = await notifyUser({
      userId: passengerUserId,
      title: 'Scheduled Ride Reminder',
      message: passengerMessage,
      module: 'ride',
      metadata: ride,
    });

    if (passengerNotification?.success) {
      logger.info('✅ Passenger notification sent successfully', {
        passengerUserId,
        rideId: ride._id,
      });
    } else {
      logger.error('❌ Failed to send passenger notification', {
        passengerUserId,
        rideId: ride._id,
        result: passengerNotification,
      });
    }

    // Notify driver if already assigned
    if (ride.driverId) {
      const driverUserId =
        ride.driverId?.userId?._id?.toString() ||
        ride.driverId?.userId?.toString() ||
        ride.driverId?.userId;

      if (driverUserId) {
        const driverMessage =
          minutesUntilRide > 0
            ? `You have a scheduled ride in ${minutesUntilRide} minute(s). Please be ready.`
            : 'Your scheduled ride is about to start. Please proceed to the pickup location.';

        logger.info('📤 Sending notification to driver', {
          driverUserId,
          message: driverMessage,
        });

        const driverNotification = await notifyUser({
          userId: driverUserId,
          title: 'Scheduled Ride Reminder',
          message: driverMessage,
          module: 'ride',
          metadata: ride,
        });

        if (driverNotification?.success) {
          logger.info('✅ Driver notification sent successfully', {
            driverUserId,
            rideId: ride._id,
          });
        } else {
          logger.error('❌ Failed to send driver notification', {
            driverUserId,
            rideId: ride._id,
            result: driverNotification,
          });
        }
      } else {
        logger.info('ℹ️ No driver assigned yet, skipping driver notification', {
          rideId: ride._id,
        });
      }
    }

    logger.info('✅ Scheduled ride notification processed', {
      rideId: ride._id,
      minutesUntilRide,
      passengerNotified: !!passengerNotification?.success,
      driverNotified: !!ride.driverId,
    });
  } catch (error) {
    logger.error('❌ Error sending scheduled ride notification', {
      rideId: ride._id,
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
};

// Activate scheduled ride: change status to REQUESTED and start driver search
const handleScheduledRide = async (ride) => {
  try {
    // Check if passenger is available (not on another active ride)
    // Only check if bookedFor is not SOMEONE (since SOMEONE rides don't check passenger availability)
    if (ride.bookedFor !== 'SOMEONE' && ride.passengerId) {
      const activeRide = await findActiveRideByPassenger(
        ride.passengerId._id || ride.passengerId,
      );
      // Check if there's an active ride that's not this scheduled ride
      if (
        activeRide &&
        activeRide._id.toString() !== ride._id.toString() &&
        !activeRide.isScheduledRide
      ) {
        await cancelRideWithPaymentHold(
          ride._id,
          ride.paymentIntentId,
          'Passenger is already on another active ride',
          'Passenger Not Available',
          'Your scheduled ride has been cancelled as you are currently on another active ride. Full refund has been processed.',
          ride.passengerId?.userId,
        );
        throw new Error('Passenger is already on another active ride');
      }
    }

    // Update ride status to REQUESTED to start driver search
    const updatedRide = await updateRideById(ride._id, {
      status: 'REQUESTED',
      requestedAt: new Date(),
    });

    if (!updatedRide) {
      throw new Error('Failed to update ride status');
    }

    // Start driver search (non-blocking)
    startProgressiveDriverSearch(updatedRide).catch((error) => {
      logger.error('Error starting driver search for scheduled ride', {
        rideId: ride._id,
        error: error.message,
      });
      // If driver search fails, cancel the ride
      cancelRideWithPaymentHold(
        ride._id,
        ride.paymentIntentId,
        'Failed to start driver search',
        'Ride Activation Failed',
        'Your scheduled ride could not be activated due to a technical issue. Full refund has been processed.',
        ride.passengerId?.userId,
      ).catch((cancelError) => {
        logger.error('Error cancelling ride after search failure', {
          rideId: ride._id,
          error: cancelError.message,
        });
      });
    });

    // Notify passenger that ride is now active and searching for drivers
    await notifyUser({
      userId: ride.passengerId?.userId,
      title: 'Scheduled Ride Activated',
      message:
        'Your scheduled ride is now active. We are searching for available drivers near you.',
      module: 'ride',
      metadata: updatedRide,
    });

    logger.info('Scheduled ride activated and driver search started', {
      rideId: ride._id,
    });
  } catch (error) {
    logger.error('Error activating scheduled ride', {
      rideId: ride._id,
      error: error.message,
    });
    throw error;
  }
};

// Helper function to check if driver is ready
const isDriverReady = (ride) => {
  // Driver is ready if they have arrived or are arriving
  return !!(ride.driverArrivedAt || ride.driverArrivingAt);
};

// Helper function to check if passenger is ready
const isPassengerReady = (ride) => {
  // Passenger is ready if they've confirmed readiness or ride has started
  return !!(ride.passengerReadyAt || ride.rideStartedAt);
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
      currentRide.status === 'RIDE_COMPLETED'
    ) {
      logger.info('Ride already processed, skipping cancellation', {
        rideId: ride._id,
        status: currentRide.status,
      });
      return;
    }

    if (
      currentRide.status !== 'SCHEDULED' &&
      currentRide.status !== 'DRIVER_ASSIGNED' &&
      currentRide.status !== 'DRIVER_ARRIVING' &&
      currentRide.status !== 'DRIVER_ARRIVED'
    ) {
      logger.info('Ride status changed, skipping cancellation', {
        rideId: ride._id,
        status: currentRide.status,
      });
      return;
    }

    // Check if passenger is on another ride (only if bookedFor is not SOMEONE)
    let passengerOnAnotherRide = false;
    if (currentRide.bookedFor !== 'SOMEONE' && currentRide.passengerId) {
      const activeRide = await findActiveRideByPassenger(
        currentRide.passengerId._id || currentRide.passengerId,
      );
      // Check if there's an active ride that's not this scheduled ride
      if (
        activeRide &&
        activeRide._id.toString() !== currentRide._id.toString()
      ) {
        passengerOnAnotherRide = true;
      }
    }

    // Check readiness
    const driverReady = isDriverReady(currentRide);
    const passengerReady = isPassengerReady(currentRide);

    // Determine cancellation scenario
    let cancellationReason;
    let notificationTitle;
    let notificationMessage;
    let refundType = 'full'; // 'full' or 'partial'

    // Priority check: If passenger is on another ride (and bookedFor is not SOMEONE), cancel with partial refund
    if (passengerOnAnotherRide) {
      cancellationReason =
        'Ride cancelled automatically: Passenger is on another active ride';
      notificationTitle = 'Scheduled Ride Cancelled - Cancellation Fee Applied';
      notificationMessage =
        'Your scheduled ride has been cancelled automatically as you are currently on another ride. 90% of your payment has been refunded, 10% has been retained as a cancellation fee.';
      refundType = 'partial';
    } else if (!driverReady && !passengerReady) {
      // Both not ready - full refund
      cancellationReason =
        'Ride cancelled automatically: Both driver and passenger were not ready after scheduled time';
      notificationTitle = 'Scheduled Ride Cancelled';
      notificationMessage =
        'Your scheduled ride has been cancelled automatically as both you and the driver were not ready. Full refund has been processed.';
      refundType = 'full';
    } else if (!driverReady && passengerReady) {
      // Driver not ready, passenger ready - full refund
      cancellationReason =
        'Ride cancelled automatically: Driver was not ready after scheduled time';
      notificationTitle = 'Scheduled Ride Cancelled';
      notificationMessage =
        'Your scheduled ride has been cancelled automatically as the driver was not ready. Full refund has been processed.';
      refundType = 'full';
    } else if (driverReady && !passengerReady) {
      // Driver ready, passenger not ready - partial refund (90% refund, 10% cancellation fee)
      cancellationReason =
        'Ride cancelled automatically: Passenger was not ready after scheduled time';
      notificationTitle = 'Scheduled Ride Cancelled - Cancellation Fee Applied';
      notificationMessage =
        'Your scheduled ride has been cancelled automatically as you were not ready. 90% of your payment has been refunded, 10% has been retained as a cancellation fee.';
      refundType = 'partial';
    } else {
      // Both ready - shouldn't happen, but handle gracefully
      logger.info(
        'Both driver and passenger are ready, skipping cancellation',
        {
          rideId: ride._id,
        },
      );
      return;
    }

    // Process payment refund based on scenario
    if (currentRide.paymentIntentId) {
      if (refundType === 'partial') {
        // Partial refund: capture full, refund 90%, keep 10%
        const estimatedFare =
          currentRide.fareBreakdown?.estimatedFare ||
          currentRide.fareBreakdown?.finalAmount ||
          0;

        if (estimatedFare > 0) {
          try {
            const partialRefundResult = await partialRefundPaymentHold(
              currentRide.paymentIntentId,
              estimatedFare,
              currentRide._id,
            );

            if (!partialRefundResult.success) {
              logger.error(
                'Failed to process partial refund for scheduled ride',
                {
                  rideId: currentRide._id,
                  paymentIntentId: currentRide.paymentIntentId,
                  error: partialRefundResult.error,
                },
              );
            } else {
              logger.info('Partial refund processed for scheduled ride', {
                rideId: currentRide._id,
                refundAmount: partialRefundResult.refundAmount,
                cancellationFee: partialRefundResult.cancellationFee,
              });
            }
          } catch (partialRefundError) {
            logger.error('Error processing partial refund for scheduled ride', {
              rideId: currentRide._id,
              paymentIntentId: currentRide.paymentIntentId,
              error: partialRefundError.message,
            });
          }
        }
      } else {
        // Full refund: cancel payment hold
        try {
          const cancelResult = await cancelPaymentHold(
            currentRide.paymentIntentId,
          );
          if (!cancelResult.success) {
            logger.error('Failed to cancel payment hold for scheduled ride', {
              rideId: currentRide._id,
              paymentIntentId: currentRide.paymentIntentId,
              error: cancelResult.error,
            });
          } else {
            logger.info('Payment hold cancelled for scheduled ride', {
              rideId: currentRide._id,
              paymentIntentId: currentRide.paymentIntentId,
            });
          }
        } catch (cancelError) {
          logger.error('Error cancelling payment hold for scheduled ride', {
            rideId: currentRide._id,
            paymentIntentId: currentRide.paymentIntentId,
            error: cancelError.message,
          });
        }
      }
    }

    // Update ride status to cancelled
    const cancelledRide = await updateRideById(currentRide._id, {
      status: 'CANCELLED_BY_SYSTEM',
      cancelledBy: 'system',
      cancellationReason,
      paymentStatus: 'CANCELLED',
      cancelledAt: new Date(),
    });

    // Notify passenger
    await notifyUser({
      userId: currentRide.passengerId?.userId,
      title: notificationTitle,
      message: notificationMessage,
      module: 'ride',
      metadata: cancelledRide || currentRide,
      type: 'ALERT',
    });

    logger.info('Scheduled ride cancelled due to no response', {
      rideId: ride._id,
      driverReady,
      passengerReady,
      passengerOnAnotherRide,
      refundType,
    });
  } catch (error) {
    logger.error('Error cancelling scheduled ride', {
      rideId: ride._id,
      error: error.message,
    });
    throw error;
  }
};
