import { Worker } from 'bullmq';
import { scheduledRideQueue } from '../queues/index.js';
import logger from '../lib/logger.js';
import {
  findRideById,
  updateRideById,
  findActiveRideByPassenger,
} from '../../dal/ride.js';
import { notifyUser } from '../../dal/notification.js';
import { emitToUser, initPubClient, getIO } from '../../realtime/socket.js';
import { getSocketIds } from '../../utils/onlineUsers.js';
import {
  cancelPaymentHold,
  partialRefundPaymentHold,
} from '../../dal/stripe.js';
import { startProgressiveDriverSearch } from '../../dal/driver.js';
import IORedis from 'ioredis';
import env from '../../config/envConfig.js';

const concurrency = 5; // Process multiple scheduled rides concurrently

// Initialize Redis pub client for cross-process socket events
initPubClient();

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
      const jobStartTime = Date.now();
      const { rideId, jobType } = job.data;

      logger.info('📥 [WORKER] Job received by worker', {
        jobId: job.id,
        rideId,
        jobType,
        jobName: job.name,
        attemptsMade: job.attemptsMade,
        timestamp: new Date().toISOString(),
      });

      try {
        logger.info('🔍 [WORKER] Fetching ride from database', {
          jobId: job.id,
          rideId,
          jobType,
          timestamp: new Date().toISOString(),
        });
        
        const ride = await findRideById(rideId);
        if (!ride) {
          logger.warn('❌ [WORKER] Ride not found in database', {
            jobId: job.id,
            rideId,
            jobType,
            timestamp: new Date().toISOString(),
          });
          return { status: 'skipped', reason: 'ride_not_found' };
        }

        logger.info('✅ [WORKER] Ride fetched successfully', {
          jobId: job.id,
          rideId,
          jobType,
          rideStatus: ride.status,
          isScheduledRide: ride.isScheduledRide,
          scheduledTime: ride.scheduledTime,
          hasDriver: !!ride.driverId,
          driverId: ride.driverId?._id || ride.driverId,
          passengerId: ride.passengerId?._id || ride.passengerId,
          timestamp: new Date().toISOString(),
        });

        // Check if ride is still scheduled based on job type
        let shouldProcess = false;
        let allowedStatuses = [];
        
        switch (jobType) {
          case 'send_notification':
            // Only process if ride is SCHEDULED or DRIVER_ASSIGNED
            shouldProcess =
              ride.status === 'SCHEDULED' || ride.status === 'DRIVER_ASSIGNED';
            allowedStatuses = ['SCHEDULED', 'DRIVER_ASSIGNED'];
            break;
          case 'activate_ride':
            // Only process if ride is SCHEDULED or DRIVER_ASSIGNED
            shouldProcess =
              ride.status === 'SCHEDULED' || ride.status === 'DRIVER_ASSIGNED';
            allowedStatuses = ['SCHEDULED', 'DRIVER_ASSIGNED'];
            break;
          case 'cancel_if_no_response':
            // Process if ride is in any of these states
            shouldProcess =
              ride.status === 'SCHEDULED' ||
              ride.status === 'DRIVER_ASSIGNED' ||
              ride.status === 'DRIVER_ARRIVING' ||
              ride.status === 'DRIVER_ARRIVED';
            allowedStatuses = ['SCHEDULED', 'DRIVER_ASSIGNED', 'DRIVER_ARRIVING', 'DRIVER_ARRIVED'];
            break;
          default:
            logger.warn('❌ [WORKER] Unknown job type', {
              jobId: job.id,
              jobType,
              rideId,
              timestamp: new Date().toISOString(),
            });
            return { status: 'skipped', reason: 'unknown_job_type' };
        }

        logger.info('🔍 [WORKER] Checking ride status for job processing', {
          jobId: job.id,
          rideId,
          jobType,
          currentStatus: ride.status,
          allowedStatuses,
          shouldProcess,
          timestamp: new Date().toISOString(),
        });

        // Skip if ride has been cancelled or completed
        if (
          ride.status === 'CANCELLED_BY_SYSTEM' ||
          ride.status === 'CANCELLED_BY_PASSENGER' ||
          ride.status === 'CANCELLED_BY_DRIVER' ||
          ride.status === 'RIDE_COMPLETED' ||
          ride.status === 'RIDE_STARTED' ||
          ride.status === 'RIDE_IN_PROGRESS'
        ) {
          logger.info('⏭️ [WORKER] Ride already processed or cancelled, skipping job', {
            jobId: job.id,
            rideId,
            currentStatus: ride.status,
            jobType,
            timestamp: new Date().toISOString(),
          });
          return { status: 'skipped', reason: 'ride_already_processed' };
        }

        if (!shouldProcess) {
          logger.info('⏭️ [WORKER] Ride status does not allow processing this job', {
            jobId: job.id,
            rideId,
            currentStatus: ride.status,
            jobType,
            allowedStatuses,
            timestamp: new Date().toISOString(),
          });
          return { status: 'skipped', reason: 'invalid_status_for_job' };
        }

        logger.info('✅ [WORKER] Ride status validated, proceeding with job processing', {
          jobId: job.id,
          rideId,
          jobType,
          rideStatus: ride.status,
          timestamp: new Date().toISOString(),
        });

        const handlerStartTime = Date.now();
        switch (jobType) {
          case 'send_notification':
            logger.info('📧 [WORKER] Processing send_notification job', {
              jobId: job.id,
              rideId,
              scheduledTime: ride.scheduledTime,
              timestamp: new Date().toISOString(),
            });
            await handleScheduledRideNotification(ride);
            break;
          case 'activate_ride':
            logger.info('🚀 [WORKER] Processing activate_ride job', {
              jobId: job.id,
              rideId,
              scheduledTime: ride.scheduledTime,
              hasDriver: !!ride.driverId,
              driverId: ride.driverId?._id || ride.driverId,
              timestamp: new Date().toISOString(),
            });
            await handleScheduledRide(ride);
            break;
          case 'cancel_if_no_response':
            logger.info('❌ [WORKER] Processing cancel_if_no_response job', {
              jobId: job.id,
              rideId,
              scheduledTime: ride.scheduledTime,
              timestamp: new Date().toISOString(),
            });
            await handleCancelScheduledRideIfNoResponse(ride);
            break;
          default:
            logger.warn('❌ [WORKER] Unknown job type in switch', {
              jobId: job.id,
              jobType,
              rideId,
              timestamp: new Date().toISOString(),
            });
        }

        const handlerTime = Date.now() - handlerStartTime;
        const totalJobTime = Date.now() - jobStartTime;
        logger.info('✅ [WORKER] Job processed successfully', {
          jobId: job.id,
          rideId,
          jobType,
          status: 'completed',
          handlerTimeMs: handlerTime,
          totalJobTimeMs: totalJobTime,
          timestamp: new Date().toISOString(),
        });

        return { status: 'completed', jobType, rideId };
      } catch (error) {
        const totalJobTime = Date.now() - jobStartTime;
        logger.error('❌ [WORKER] Error processing scheduled ride job', {
          jobId: job.id,
          rideId,
          jobType,
          error: error.message,
          stack: error.stack,
          totalJobTimeMs: totalJobTime,
          timestamp: new Date().toISOString(),
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
  const startTime = Date.now();
  try {
    logger.info('📧 [NOTIFICATION] Starting notification handler', {
      rideId: ride._id,
      scheduledTime: ride.scheduledTime,
      status: ride.status,
      timestamp: new Date().toISOString(),
    });

    const scheduledTime = new Date(ride.scheduledTime);
    const now = new Date();
    const minutesUntilRide = Math.floor((scheduledTime - now) / (1000 * 60));
    const secondsUntilRide = Math.floor((scheduledTime - now) / 1000);

    logger.info('⏰ [NOTIFICATION] Time calculation', {
      rideId: ride._id,
      scheduledTime: scheduledTime.toISOString(),
      currentTime: now.toISOString(),
      minutesUntilRide,
      secondsUntilRide,
      timeDifferenceMs: scheduledTime.getTime() - now.getTime(),
      timestamp: new Date().toISOString(),
    });

    // Get passenger userId
    const passengerUserId =
      ride.passengerId?.userId?._id?.toString() ||
      ride.passengerId?.userId?.toString() ||
      ride.passengerId?.userId;

    logger.info('👤 [NOTIFICATION] Extracted passenger information', {
      rideId: ride._id,
      passengerUserId,
      passengerId: ride.passengerId?._id || ride.passengerId,
      bookedFor: ride.bookedFor,
      bookedForName: ride.bookedForName,
      timestamp: new Date().toISOString(),
    });

    if (!passengerUserId) {
      logger.error('❌ [NOTIFICATION] Cannot find passenger userId', {
        rideId: ride._id,
        passengerId: ride.passengerId,
        timestamp: new Date().toISOString(),
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

    // Send socket notification for real-time in-app alert
    emitToUser(passengerUserId, 'ride:scheduled_reminder', {
      success: true,
      objectType: 'scheduled-ride-reminder',
      data: {
        ride,
        minutesUntilRide,
        scheduledTime: scheduledTime.toISOString(),
      },
      message: passengerMessage,
    });

    // Send push notification
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

        // Send socket notification for real-time in-app alert
        emitToUser(driverUserId, 'ride:scheduled_reminder', {
          success: true,
          objectType: 'scheduled-ride-reminder',
          data: {
            ride,
            minutesUntilRide,
            scheduledTime: scheduledTime.toISOString(),
          },
          message: driverMessage,
        });

        // Send push notification
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

    const processingTime = Date.now() - startTime;
    logger.info('✅ [NOTIFICATION] Scheduled ride notification processed successfully', {
      rideId: ride._id,
      minutesUntilRide,
      passengerNotified: !!passengerNotification?.success,
      driverNotified: !!ride.driverId,
      driverId: ride.driverId?._id || ride.driverId,
      processingTimeMs: processingTime,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const processingTime = Date.now() - startTime;
    logger.error('❌ [NOTIFICATION] Error sending scheduled ride notification', {
      rideId: ride._id,
      error: error.message,
      stack: error.stack,
      processingTimeMs: processingTime,
      timestamp: new Date().toISOString(),
    });
    throw error;
  }
};

// Activate scheduled ride: change status to REQUESTED and start driver search
const handleScheduledRide = async (ride) => {
  const startTime = Date.now();
  try {
    logger.info('🚀 [ACTIVATION] Starting scheduled ride activation', {
      rideId: ride._id,
      scheduledTime: ride.scheduledTime,
      status: ride.status,
      bookedFor: ride.bookedFor,
      hasDriver: !!ride.driverId,
      driverId: ride.driverId?._id || ride.driverId,
      timestamp: new Date().toISOString(),
    });

    // Check if passenger is available (not on another active ride)
    // Only check if bookedFor is not SOMEONE (since SOMEONE rides don't check passenger availability)
    if (ride.bookedFor !== 'SOMEONE' && ride.passengerId) {
      logger.info('🔍 [ACTIVATION] Checking passenger availability', {
        rideId: ride._id,
        passengerId: ride.passengerId._id || ride.passengerId,
        timestamp: new Date().toISOString(),
      });
      
      const activeRide = await findActiveRideByPassenger(
        ride.passengerId._id || ride.passengerId,
      );
      
      logger.info('✅ [ACTIVATION] Passenger availability check completed', {
        rideId: ride._id,
        hasActiveRide: !!activeRide,
        activeRideId: activeRide?._id,
        activeRideIsScheduled: activeRide?.isScheduledRide,
        timestamp: new Date().toISOString(),
      });
      
      // Check if there's an active ride that's not this scheduled ride
      if (
        activeRide &&
        activeRide._id.toString() !== ride._id.toString() &&
        !activeRide.isScheduledRide
      ) {
        logger.warn('⚠️ [ACTIVATION] Passenger is on another active ride, cancelling scheduled ride', {
          rideId: ride._id,
          activeRideId: activeRide._id,
          activeRideStatus: activeRide.status,
          timestamp: new Date().toISOString(),
        });
        
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
    } else {
      logger.info('ℹ️ [ACTIVATION] Skipping passenger availability check', {
        rideId: ride._id,
        reason: ride.bookedFor === 'SOMEONE' ? 'booked_for_someone' : 'no_passenger_id',
        timestamp: new Date().toISOString(),
      });
    }

    // Check if ride already has a driver assigned (scheduled ride with pre-assigned driver)
    const hasPreAssignedDriver = !!ride.driverId;
    let updatedRide;

    logger.info('🔍 [ACTIVATION] Checking driver assignment status', {
      rideId: ride._id,
      hasPreAssignedDriver,
      driverId: ride.driverId?._id || ride.driverId,
      timestamp: new Date().toISOString(),
    });

    if (hasPreAssignedDriver) {
      logger.info('👨‍✈️ [ACTIVATION] Ride has pre-assigned driver, checking driver availability', {
        rideId: ride._id,
        driverId: ride.driverId?._id || ride.driverId,
        timestamp: new Date().toISOString(),
      });
      
      // Check if driver is still available before activating with pre-assigned driver
      const DriverLocation = (await import('../../models/DriverLocation.js')).default;
      const driverId = ride.driverId?._id || ride.driverId;
      const driverLocation = await DriverLocation.findOne({ driverId }).lean();
      
      logger.info('✅ [ACTIVATION] Driver location fetched', {
        rideId: ride._id,
        driverId,
        driverLocationFound: !!driverLocation,
        driverStatus: driverLocation?.status,
        driverIsAvailable: driverLocation?.isAvailable,
        driverCurrentRideId: driverLocation?.currentRideId,
        timestamp: new Date().toISOString(),
      });

      // If driver is not available, fall back to searching for a new driver
      if (
        !driverLocation ||
        driverLocation.status !== 'online' ||
        driverLocation.currentRideId ||
        !driverLocation.isAvailable
      ) {
        logger.warn('⚠️ [ACTIVATION] Pre-assigned driver not available, starting new driver search', {
          rideId: ride._id,
          driverId,
          driverStatus: driverLocation?.status,
          isAvailable: driverLocation?.isAvailable,
          currentRideId: driverLocation?.currentRideId,
          reason: !driverLocation ? 'driver_location_not_found' :
                  driverLocation.status !== 'online' ? 'driver_not_online' :
                  driverLocation.currentRideId ? 'driver_on_another_ride' :
                  !driverLocation.isAvailable ? 'driver_not_available' : 'unknown',
          timestamp: new Date().toISOString(),
        });

        // Clear the driver assignment and start fresh search
        // Keep status as SCHEDULED - don't activate until new driver is assigned
        updatedRide = await updateRideById(ride._id, {
          status: 'SCHEDULED', // Keep as SCHEDULED until driver is assigned
          driverId: null,
          driverAssignedAt: null,
          requestedAt: new Date(),
        });

        if (!updatedRide) {
          throw new Error('Failed to update ride status');
        }

        // Notify passenger that assigned driver is unavailable
        const passengerUserId =
          ride.passengerId?.userId?._id?.toString() ||
          ride.passengerId?.userId?.toString() ||
          ride.passengerId?.userId;

        if (passengerUserId) {
          await notifyUser({
            userId: passengerUserId,
            title: 'Driver Unavailable',
            message:
              'Your assigned driver is currently unavailable. We are searching for another driver for you.',
            module: 'ride',
            metadata: updatedRide,
          });

          emitToUser(passengerUserId, 'ride:driver_unavailable', {
            success: false,
            objectType: 'driver-unavailable',
            data: updatedRide,
            message: 'Your assigned driver is unavailable. Searching for a new driver.',
          });
        }

        // Start new driver search
        startProgressiveDriverSearch(updatedRide).catch((error) => {
          logger.error('Error starting driver search for scheduled ride after driver unavailable', {
            rideId: ride._id,
            error: error.message,
          });
          cancelRideWithPaymentHold(
            ride._id,
            ride.paymentIntentId,
            'Failed to find replacement driver',
            'Ride Activation Failed',
            'Your scheduled ride could not be activated as no drivers are available. Full refund has been processed.',
            passengerUserId,
          ).catch((cancelError) => {
            logger.error('Error cancelling ride after search failure', {
              rideId: ride._id,
              error: cancelError.message,
            });
          });
        });

        logger.info('✅ [ACTIVATION] Started new driver search after pre-assigned driver unavailable', {
          rideId: ride._id,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      logger.info('✅ [ACTIVATION] Pre-assigned driver is available, activating ride', {
        rideId: ride._id,
        driverId,
        timestamp: new Date().toISOString(),
      });

      // If driver is pre-assigned and available, change status to DRIVER_ASSIGNED instead of REQUESTED
      updatedRide = await updateRideById(ride._id, {
        status: 'DRIVER_ASSIGNED',
        requestedAt: new Date(),
      });

      if (!updatedRide) {
        logger.error('❌ [ACTIVATION] Failed to update ride status', {
          rideId: ride._id,
          timestamp: new Date().toISOString(),
        });
        throw new Error('Failed to update ride status');
      }

      logger.info('✅ [ACTIVATION] Ride status updated to DRIVER_ASSIGNED', {
        rideId: ride._id,
        newStatus: updatedRide.status,
        requestedAt: updatedRide.requestedAt,
        timestamp: new Date().toISOString(),
      });

      // IMPORTANT: For scheduled rides with pre-assigned drivers, we must set
      // DriverLocation.currentRideId so that passengers receive
      // `ride:driver_update_location` events in real time.
      try {
        const updatedDriverLocation = await DriverLocation.findOneAndUpdate(
          { driverId },
          {
            currentRideId: updatedRide._id,
            isAvailable: false,
            lastUpdated: new Date(),
          },
          { new: true },
        );

        logger.info('Updated driver location with currentRideId for scheduled ride', {
          rideId: ride._id,
          driverId,
          driverLocationId: updatedDriverLocation?._id,
        });
      } catch (locationError) {
        logger.error(
          'Failed to update driver location with currentRideId for scheduled ride',
          {
            rideId: ride._id,
            driverId,
            error: locationError.message,
          },
        );
      }

      // Get passenger and driver user IDs for socket notifications
      const passengerUserId =
        updatedRide.passengerId?.userId?._id?.toString() ||
        updatedRide.passengerId?.userId?.toString() ||
        ride.passengerId?.userId;

      const driverUserId =
        updatedRide.driverId?.userId?._id?.toString() ||
        updatedRide.driverId?.userId?.toString() ||
        ride.driverId?.userId;

      const passengerName =
        ride.bookedFor === 'SOMEONE'
          ? ride.bookedForName
          : updatedRide.passengerId?.userId?.name || 'Passenger';
      const driverName = updatedRide.driverId?.userId?.name || 'Your driver';

      // Emit active ride data to passenger via socket
      if (passengerUserId) {
        emitToUser(passengerUserId, 'ride:active', {
          success: true,
          objectType: 'active-ride',
          data: updatedRide,
          message: 'Your scheduled ride is now active',
        });

        // Automatically join passenger to ride room to receive location updates
        try {
          const io = getIO();
          if (io) {
            const passengerSocketIds = await getSocketIds(passengerUserId);
            const rideRoom = `ride:${updatedRide._id}`;
            
            for (const socketId of passengerSocketIds) {
              const socket = io.sockets.sockets.get(socketId);
              if (socket) {
                socket.join(rideRoom);
                logger.info('✅ Auto-joined passenger to ride room', {
                  passengerUserId,
                  rideId: updatedRide._id,
                  socketId,
                });
              }
            }

            // Emit confirmation that passenger joined the room
            if (passengerSocketIds.length > 0) {
              io.to(rideRoom).emit('ride:passenger_join_ride', {
                success: true,
                objectType: 'passenger-join-ride',
                data: updatedRide,
                message: 'Passenger automatically joined ride room',
              });
            }
          }
        } catch (joinError) {
          logger.error('Failed to auto-join passenger to ride room', {
            passengerUserId,
            rideId: updatedRide._id,
            error: joinError.message,
          });
        }

        // Also notify via push notification
        await notifyUser({
          userId: passengerUserId,
          title: 'Scheduled Ride Started',
          message: `Your scheduled ride with ${driverName} is now active. Please be ready at the pickup location.`,
          module: 'ride',
          metadata: updatedRide,
        });

        logger.info('✅ Sent active ride notification to passenger', {
          passengerUserId,
          rideId: ride._id,
        });
      }

      // Emit active ride data to driver via socket
      if (driverUserId) {
        emitToUser(driverUserId, 'ride:active', {
          success: true,
          objectType: 'active-ride',
          data: updatedRide,
          message: 'Your scheduled ride is now active',
        });

        // Also notify via push notification
        await notifyUser({
          userId: driverUserId,
          title: 'Scheduled Ride Started',
          message: `Your scheduled ride with ${passengerName} is now active. Please proceed to the pickup location.`,
          module: 'ride',
          metadata: updatedRide,
        });

        logger.info('✅ Sent active ride notification to driver', {
          driverUserId,
          rideId: ride._id,
        });
      }

      const activationTime = Date.now() - startTime;
      logger.info('✅ [ACTIVATION] Scheduled ride with pre-assigned driver activated successfully', {
        rideId: ride._id,
        driverId: ride.driverId?._id || ride.driverId,
        status: updatedRide.status,
        activationTimeMs: activationTime,
        timestamp: new Date().toISOString(),
      });
    } else {
      logger.info('🔍 [ACTIVATION] No pre-assigned driver, starting driver search', {
        rideId: ride._id,
        timestamp: new Date().toISOString(),
      });
      
      // No pre-assigned driver - keep status as SCHEDULED and start driver search in background
      // Ride will only become active (REQUESTED/DRIVER_ASSIGNED) when driver is assigned
      // Just update requestedAt to track when scheduled time arrived
      updatedRide = await updateRideById(ride._id, {
        requestedAt: new Date(),
        // Keep status as SCHEDULED - don't activate until driver is assigned
      });

      if (!updatedRide) {
        logger.error('❌ [ACTIVATION] Failed to update ride', {
          rideId: ride._id,
          timestamp: new Date().toISOString(),
        });
        throw new Error('Failed to update ride');
      }

      logger.info('✅ [ACTIVATION] Ride updated, starting driver search', {
        rideId: ride._id,
        status: updatedRide.status,
        requestedAt: updatedRide.requestedAt,
        timestamp: new Date().toISOString(),
      });

      // Start driver search (non-blocking) - this will work with SCHEDULED status for scheduled rides
      startProgressiveDriverSearch(updatedRide).catch((error) => {
        logger.error('❌ [ACTIVATION] Error starting driver search for scheduled ride', {
          rideId: ride._id,
          error: error.message,
          stack: error.stack,
          timestamp: new Date().toISOString(),
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
          logger.error('❌ [ACTIVATION] Error cancelling ride after search failure', {
            rideId: ride._id,
            error: cancelError.message,
            stack: cancelError.stack,
            timestamp: new Date().toISOString(),
          });
        });
      });

      // Notify passenger that we are searching for drivers (but ride is not active yet)
      const passengerUserId =
        updatedRide.passengerId?.userId?._id?.toString() ||
        updatedRide.passengerId?.userId?.toString() ||
        ride.passengerId?.userId;

      if (passengerUserId) {
        logger.info('📤 [ACTIVATION] Sending driver search notification to passenger', {
          rideId: ride._id,
          passengerUserId,
          timestamp: new Date().toISOString(),
        });
        
        await notifyUser({
          userId: ride.passengerId?.userId,
          title: 'Searching for Driver',
          message:
            'Your scheduled ride time has arrived. We are searching for available drivers near you. The ride will become active once a driver is assigned.',
          module: 'ride',
          metadata: updatedRide,
        });
        
        logger.info('✅ [ACTIVATION] Driver search notification sent to passenger', {
          rideId: ride._id,
          passengerUserId,
          timestamp: new Date().toISOString(),
        });
      }

      const activationTime = Date.now() - startTime;
      logger.info('✅ [ACTIVATION] Scheduled ride driver search started (status remains SCHEDULED until driver assigned)', {
        rideId: ride._id,
        status: updatedRide.status,
        activationTimeMs: activationTime,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    const activationTime = Date.now() - startTime;
    logger.error('❌ [ACTIVATION] Error activating scheduled ride', {
      rideId: ride._id,
      error: error.message,
      stack: error.stack,
      activationTimeMs: activationTime,
      timestamp: new Date().toISOString(),
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
  const startTime = Date.now();
  try {
    logger.info('❌ [CANCELLATION] Starting cancellation check for scheduled ride', {
      rideId: ride._id,
      scheduledTime: ride.scheduledTime,
      timestamp: new Date().toISOString(),
    });
    
    const currentRide = await findRideById(ride._id);

    if (!currentRide) {
      logger.warn('⚠️ [CANCELLATION] Ride not found for cancellation check', {
        rideId: ride._id,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    logger.info('✅ [CANCELLATION] Ride fetched for cancellation check', {
      rideId: ride._id,
      status: currentRide.status,
      scheduledTime: currentRide.scheduledTime,
      timestamp: new Date().toISOString(),
    });

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

    const cancellationTime = Date.now() - startTime;
    logger.info('✅ [CANCELLATION] Scheduled ride cancelled due to no response', {
      rideId: ride._id,
      driverReady,
      passengerReady,
      passengerOnAnotherRide,
      refundType,
      cancellationReason,
      cancellationTimeMs: cancellationTime,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const cancellationTime = Date.now() - startTime;
    logger.error('❌ [CANCELLATION] Error cancelling scheduled ride', {
      rideId: ride._id,
      error: error.message,
      stack: error.stack,
      cancellationTimeMs: cancellationTime,
      timestamp: new Date().toISOString(),
    });
    throw error;
  }
};
