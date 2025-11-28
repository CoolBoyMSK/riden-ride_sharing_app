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

const concurrency = 5; // Process multiple scheduled rides concurrently

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
      await cancelRideWithPaymentHold(
        ride._id,
        ride.paymentIntentId,
        'No driver assigned to the scheduled ride',
        'No Driver Assigned',
        'No driver assigned to the ride you have scheduled. Please try again later.',
        ride.passengerId?.userId,
      );
      throw new Error('No driver assigned to the ride');
    }

    if (ride.driverId.status !== 'online') {
      await cancelRideWithPaymentHold(
        ride._id,
        ride.paymentIntentId,
        'The assigned driver is not available to accept the ride',
        'No Driver Available',
        'The assigned driver is not available to accept the ride. Please try again later.',
        ride.passengerId?.userId,
      );
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
