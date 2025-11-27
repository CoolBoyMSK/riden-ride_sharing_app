import {
  createRide,
  findActiveRideByPassenger,
  findScheduledRideByPassenger,
} from '../../../dal/ride.js';
import RideModel from '../../../models/Ride.js';
import { findPassengerData } from '../../../dal/passenger.js';
import {
  analyzeSurgePricing,
  startProgressiveDriverSearch,
  updateExistingRidesSurgePricing,
  findFareConfigurationForLocation,
  isAirportRide,
  stopDriverSearch,
} from '../../../dal/driver.js';
import { calculateEstimatedFare } from './fareCalculationService.js';
import {
  notifyUser,
  createAdminNotification,
} from '../../../dal/notification.js';
import { CAR_TYPES, PASSENGER_ALLOWED } from '../../../enums/vehicleEnums.js';
import { PAYMENT_METHODS, CARD_TYPES } from '../../../enums/paymentEnums.js';
import { scheduledRideQueue } from '../../../scheduled/queues/index.js';
import {
  holdRidePayment,
  cancelPaymentHold,
  getPassengerWallet,
} from '../../../dal/stripe.js';

export const getFareEstimate = async (
  pickupLocation,
  dropoffLocation,
  carType,
  promoCode = null,
) => {
  try {
    if (!pickupLocation || !dropoffLocation || !carType) {
      return {
        success: false,
        message: 'Invalid pickup location, dropoff location, or car type',
      };
    }

    if (!pickupLocation.coordinates || !dropoffLocation.coordinates) {
      return {
        success: false,
        message: 'Invalid pickup location or dropoff location',
      };
    }

    if (!CAR_TYPES.includes(carType)) {
      return {
        success: false,
        message: 'Invalid car type',
      };
    }

    // Calculate distance and duration
    const distance = await calculateDistance(pickupLocation, dropoffLocation);
    const duration = estimateDuration(distance);

    const fareConfig = await findFareConfigurationForLocation(
      pickupLocation.coordinates,
      carType,
    );

    if (!fareConfig) {
      return {
        success: false,
        message: 'No fare configuration found for this location and car type',
      };
    }

    const surgeMultiplier = 1;

    // Calculate fare
    const fareResult = await calculateEstimatedFare(
      carType,
      distance,
      duration,
      promoCode,
      surgeMultiplier,
      fareConfig,
    );

    if (!fareResult.success) {
      return {
        success: false,
        message: fareResult.error,
      };
    }

    return {
      success: true,
      estimate: {
        distance: Math.round(distance * 100) / 100, // Round to 2 decimal places
        estimatedDuration: duration,
        fareBreakdown: fareResult.fareBreakdown,
        estimatedFare: fareResult.estimatedFare,
        promoDetails: fareResult.promoDetails,
        currency: fareResult.currency,
        passengersAllowed: PASSENGER_ALLOWED[carType].passengersAllowed,
        patientsAllowed: PASSENGER_ALLOWED[carType].patientsAllowed,
      },
    };
  } catch (error) {
    return {
      success: false,
      message: 'Failed to calculate fare estimate',
      error: error.message,
    };
  }
};

export const getAvailableCarTypes = async () => {
  try {
    return {
      success: true,
      carTypes: CAR_TYPES,
    };
  } catch (error) {
    return {
      success: false,
      message: 'Failed to get available car types',
      error: error.message,
    };
  }
};

const calculateDistance = async (pickup, dropoff) => {
  try {
    const response = await fetch(
      `http://router.project-osrm.org/route/v1/driving/${pickup.coordinates[0]},${pickup.coordinates[1]};${dropoff.coordinates[0]},${dropoff.coordinates[1]}?overview=false`,
    );

    const data = await response.json();

    if (data.code === 'Ok' && data.routes.length > 0) {
      const distanceInMeters = data.routes[0].distance;
      const distanceInKm = distanceInMeters / 1000;
      return distanceInKm;
    } else {
      throw new Error('Failed to calculate distance from OSRM');
    }
  } catch (error) {
    console.error('OSRM API error:', error);
    const straightDistance = calculateHaversineDistance(pickup, dropoff);
    let multiplier = 1.3;

    // You can enhance this by detecting if coordinates are in urban area
    // For now, using a conservative multiplier
    if (straightDistance > 20) {
      multiplier = 1.2; // Longer distances tend to be more direct
    } else if (straightDistance < 5) {
      multiplier = 1.4; // Short distances in cities have more detours
    }

    return straightDistance * multiplier;
  }
};

const calculateHaversineDistance = (pickup, dropoff) => {
  const R = 6371; // Earth's radius in kilometers
  const dLat =
    ((dropoff.coordinates[1] - pickup.coordinates[1]) * Math.PI) / 180;
  const dLon =
    ((dropoff.coordinates[0] - pickup.coordinates[0]) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((pickup.coordinates[1] * Math.PI) / 180) *
      Math.cos((dropoff.coordinates[1] * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return distance;
};

const estimateDuration = (distance) => {
  const averageSpeed = 30; // km/h in city traffic
  return Math.ceil((distance / averageSpeed) * 60); // minutes
};

export const bookRide = async (userId, rideData) => {
  const startTime = Date.now();
  let ride = null;
  let paymentHoldResult = null;

  try {
    const {
      pickupLocation,
      dropoffLocation,
      carType,
      bookedFor,
      bookedForName,
      bookedForPhoneNumber,
      paymentMethod,
      paymentMethodId,
      cardType,
      promoCode,
      scheduledTime,
      specialRequests,
    } = rideData;

    // Input validation
    const validationError = validateRideInput(rideData);
    if (validationError) return validationError;

    // Find passenger profile
    const passenger = await findPassengerData(userId);
    if (!passenger) {
      return {
        success: false,
        message: 'Passenger profile not found',
      };
    }

    // Check for active rides
    const activeRide = await findActiveRideByPassenger(passenger._id);
    if (activeRide) {
      return {
        success: false,
        message: 'You already have an active ride',
        activeRide: activeRide,
      };
    }

    const scheduledRide = await findScheduledRideByPassenger(passenger._id);
    if (scheduledRide === false) {
      return {
        success: false,
        message:
          'You already have a scheduled ride within 45 minutes. Please wait before booking another ride.',
      };
    } else if (scheduledRide) {
      const notifyPassenger = await notifyUser({
        userId: passenger.userId?._id,
        title: 'Scheduled Ride Reminder',
        message: `You have a scheduled ride in ${scheduledRide.remainingTime}. ${scheduledRide.ride.bookedFor === 'SOMEONE' ? `For ${scheduledRide.ride.bookedForName} with phone number ${scheduledRide.ride.bookedForPhoneNumber}` : ''}`,
        module: 'ride',
        metadata: scheduledRide.ride,
      });
      if (!notifyPassenger) {
        console.error('Failed to send notification');
      }
    }

    if (bookedFor === 'SOMEONE') {
      if (!bookedForName || !bookedForPhoneNumber) {
        return {
          success: false,
          message:
            'Name and phone number are required when booking ride for someone else',
        };
      }

      const name = bookedForName.trim();
      const phoneNumber = bookedForPhoneNumber.trim();

      if (name.length === 0 || phoneNumber.length === 0) {
        return {
          success: false,
          message:
            'Name and phone number are required when booking ride for someone else',
        };
      }

      if (name.length < 3) {
        return {
          success: false,
          message: 'Name must be at least 3 characters long',
        };
      }

      if (!/^[0-9+\- ]{7,20}$/.test(phoneNumber)) {
        return {
          success: false,
          message:
            'Phone number must be 7-20 characters and contain only digits, +, -, or spaces.',
        };
      }
    }

    // Parallel execution for better performance
    const [distance, airport, surgeAnalysis] = await Promise.all([
      calculateDistance(pickupLocation, dropoffLocation),
      isAirportRide(pickupLocation.coordinates),
      analyzeSurgePricing(pickupLocation.coordinates, carType),
    ]);

    // Validate calculations
    if (distance <= 0) {
      return {
        success: false,
        message: 'Invalid distance calculated. Please check locations.',
      };
    }

    const duration = estimateDuration(distance);

    const {
      surgeDataWithCurrentRide,
      currentSurgeData,
      shouldUpdateExistingRides,
      surgeMultiplier,
      isSurgeApplied,
    } = surgeAnalysis;

    // Log surge analysis results
    if (isSurgeApplied) {
      console.log(
        shouldUpdateExistingRides
          ? `SURGE ${!currentSurgeData.isSurge ? 'ACTIVATED' : 'LEVEL INCREASED'} by current ride`
          : `SURGE APPLIED (existing level)`,
      );
    }

    const fareConfig = await findFareConfigurationForLocation(
      pickupLocation.coordinates,
      carType,
    );
    if (!fareConfig) {
      return {
        success: false,
        message: 'No fare configuration found for this location and car type',
      };
    }

    let fareResult;
    if (scheduledTime) {
      const time = new Date(scheduledTime);
      const now = new Date();
      if (time < now) {
        return {
          success: false,
          message: 'Scheduled time must be in the future',
        };
      }
      const timeDifference = time - now;
      if (timeDifference < 2 * 60 * 1000) {
        return {
          success: false,
          message: 'Scheduled time must be more than 30 minutes from now',
        };
      }

      fareResult = await calculateEstimatedFare(
        carType,
        distance,
        duration,
        promoCode,
        surgeMultiplier,
        fareConfig,
        time,
      );
    } else {
      fareResult = await calculateEstimatedFare(
        carType,
        distance,
        duration,
        promoCode,
        surgeMultiplier,
        fareConfig,
      );
    }

    if (!fareResult.success) {
      return {
        success: false,
        message: fareResult.error || 'Failed to calculate fare',
      };
    }

    // Validate payment method
    const paymentValidation = await validatePaymentMethod(
      passenger,
      paymentMethod,
      paymentMethodId,
    );
    if (!paymentValidation.success) return paymentValidation;

    if (paymentMethod === 'CARD' && !CARD_TYPES.includes(cardType)) {
      return {
        success: false,
        message: 'Invalid card type',
      };
    }

    // Hold/authorize payment for card, Google Pay, and Apple Pay payments
    if (PAYMENT_METHODS.includes(paymentMethod) && paymentMethodId) {
      const estimatedAmount = fareResult.estimatedFare;
      console.log('Start');
      paymentHoldResult = await holdRidePayment(
        passenger,
        estimatedAmount,
        paymentMethodId,
        paymentMethod,
        cardType,
      );
      console.log('paymentHoldResult:', paymentHoldResult);
      console.log('end');
      if (!paymentHoldResult.success) {
        return {
          success: false,
          message:
            paymentHoldResult.error ||
            'Failed to authorize payment. Please check your payment method and try again.',
        };
      }
    } else {
      return {
        success: false,
        message: 'Payment method not supported',
      };
    }

    // Create ride record
    ride = await createRideRecord({
      passenger,
      pickupLocation,
      dropoffLocation,
      carType,
      paymentMethod,
      paymentMethodId,
      scheduledTime,
      specialRequests,
      distance,
      duration,
      isAirport: airport ? true : false,
      airport: airport ? airport : {},
      fareResult,
      surgeMultiplier,
      isSurgeApplied,
      surgeData: surgeDataWithCurrentRide,
      fareConfig,
      isScheduledRide: scheduledTime ? true : false,
      status: scheduledTime ? 'SCHEDULED' : 'REQUESTED',
      bookedFor,
      bookedForName,
      bookedForPhoneNumber,
      passengersAllowed: PASSENGER_ALLOWED[carType].passengersAllowed,
      patientsAllowed: PASSENGER_ALLOWED[carType].patientsAllowed,
      paymentIntentId: paymentHoldResult?.paymentIntentId || null,
      cardType,
    });

    if (!ride) {
      return {
        success: false,
        message: 'Failed to create ride record. Please try again.',
      };
    } else if (ride.isScheduledRide) {
      const notifyPassenger = await notifyUser({
        userId: passenger.userId?._id,
        title: 'Scheduling Request Sent',
        message: `Your scheduling request has been sent successfully. You will be notified when the request is responded by the admin.`,
        module: 'ride',
        metadata: ride,
      });
      if (!notifyPassenger) {
        console.error('Failed to send notification');
      }

      if (ride.bookedFor === 'SOMEONE') {
        const notifyAdmin = await createAdminNotification({
          title: 'New Ride Scheduling Request',
          message: `A new scheduling request has been sent by ${ride.userId?.name} for ${ride.bookedForName} with phone number ${ride.bookedForPhoneNumber}`,
          metadata: ride,
          module: 'ride',
        });
        if (!notifyAdmin) {
          console.error('Failed to send notification');
        }
      } else {
        const notifyAdmin = await createAdminNotification({
          title: 'New Ride Scheduling Request',
          message: `A new scheduling request has been sent by a ${passenger.userId?.name}`,
          metadata: ride,
          module: 'ride',
        });
        if (!notifyAdmin) {
          console.error('Failed to send notification');
        }
      }

      // Add scheduled ride to queue for processing
      await addScheduledRideToQueue(ride);

      return {
        success: true,
        message: 'Scheduling request sent successfully',
        ride: ride,
      };
    }

    // Update existing rides if surge was activated/increased (non-blocking)
    if (shouldUpdateExistingRides) {
      updateExistingRidesSurgePricing(
        pickupLocation.coordinates,
        carType,
        surgeMultiplier,
        surgeDataWithCurrentRide.surgeLevel,
      ).catch((error) => {
        console.error('Background surge update failed:', error);
      });
    }

    // Start driver search (non-blocking)
    startProgressiveDriverSearch(ride).catch((error) => {
      console.error('Background driver search failed:', error);
    });

    const processingTime = Date.now() - startTime;
    console.log(`Ride ${ride._id} booked successfully in ${processingTime}ms`);

    return {
      success: true,
      message: 'Ride booked successfully. Searching for drivers...',
      ride: ride,
      metadata: {
        processingTime: `${processingTime}ms`,
        surgeApplied: isSurgeApplied,
        surgeLevel: surgeDataWithCurrentRide.surgeLevel,
        searchRadius: '5km',
      },
    };
  } catch (error) {
    console.error('Ride booking error:', error);

    // Cleanup on error
    // Release payment hold if it was created
    if (paymentHoldResult?.success && paymentHoldResult?.paymentIntentId) {
      await cancelPaymentHold(paymentHoldResult.paymentIntentId).catch(
        (cancelError) => {
          console.error('Failed to cancel payment hold:', cancelError);
        },
      );
    }

    // Cleanup ride if it was created
    if (ride?._id) {
      await cleanupFailedRide(ride._id).catch((cleanupError) => {
        console.error('Cleanup failed:', cleanupError);
      });
    }

    return {
      success: false,
      message: 'Failed to book ride. Please try again.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    };
  }
};

const validateRideInput = (rideData) => {
  const { pickupLocation, dropoffLocation, carType, paymentMethod } = rideData;

  if (!pickupLocation || !dropoffLocation || !carType || !paymentMethod) {
    return {
      success: false,
      message:
        'Missing required fields: pickupLocation, dropoffLocation, carType, paymentMethod',
    };
  } else if (!CAR_TYPES.includes(carType)) {
    return {
      success: false,
      message: `Car type must be one of: ${CAR_TYPES.join(', ')}`,
    };
  } else if (!PASSENGER_ALLOWED[carType]) {
    return {
      success: false,
      message: `Passengers allowed must be greater than 0`,
    };
  } else if (PASSENGER_ALLOWED[carType].patientsAllowed < 0) {
    return {
      success: false,
      message: `Patients allowed must be greater than 0`,
    };
  }

  return null;
};

const validatePaymentMethod = async (
  passenger,
  paymentMethod,
  paymentMethodId,
) => {
  // Validate CARD, GOOGLE_PAY, or APPLE_PAY - all require a payment method ID
  if (
    paymentMethod === 'CARD' ||
    paymentMethod === 'GOOGLE_PAY' ||
    paymentMethod === 'APPLE_PAY'
  ) {
    if (!paymentMethodId) {
      return {
        success: false,
        message: 'Payment method ID is required',
      };
    }
  } else if (paymentMethod === 'WALLET') {
    const wallet = await getPassengerWallet(passenger._id);
    if (!wallet) {
      return {
        success: false,
        message: 'Wallet not found',
      };
    }
  } else if (paymentMethod !== 'CASH') {
    return {
      success: false,
      message: 'Invalid payment method',
    };
  }

  return { success: true, wallet: null };
};

const createRideRecord = async (params) => {
  const {
    passenger,
    pickupLocation,
    dropoffLocation,
    carType,
    paymentMethod,
    paymentMethodId,
    scheduledTime,
    specialRequests,
    distance,
    duration,
    isAirport,
    airport,
    fareResult,
    surgeMultiplier,
    isSurgeApplied,
    surgeData,
    fareConfig,
    isScheduledRide,
    status,
    bookedFor,
    bookedForName,
    bookedForPhoneNumber,
    passengersAllowed,
    patientsAllowed,
    paymentIntentId,
    cardType,
  } = params;

  const ridePayload = {
    passengerId: passenger._id,
    pickupLocation,
    dropoffLocation,
    carType,
    paymentMethod,
    paymentIntentId,
    paymentMethodId,
    ...(cardType && { cardType }),
    scheduledTime: scheduledTime ? new Date(scheduledTime) : null,
    ...(specialRequests && { specialRequests }),
    estimatedDistance: distance,
    estimatedDuration: duration,
    estimatedFare: fareResult.estimatedFare,
    fareBreakdown: fareResult.fareBreakdown,
    status,
    isAirport,
    airport,
    searchRadius: 5,
    searchStartTime: new Date(),
    expiryTime: new Date(Date.now() + 5 * 60 * 1000),
    surgeMultiplier,
    isSurgeApplied,
    surgeLevel: surgeData.surgeLevel,
    surgeData,
    fareConfig: fareResult.fareConfig,
    fareConfigType: fareConfig.zone ? 'zone' : 'default',
    zoneName: fareConfig.zone?.name || 'default',
    createdAt: new Date(),
    isScheduledRide,
    bookedFor,
    bookedForName,
    bookedForPhoneNumber,
    passengersAllowed,
    patientsAllowed,
  };

  return await createRide(ridePayload);
};

const addScheduledRideToQueue = async (ride) => {
  try {
    if (!ride.scheduledTime || !ride.isScheduledRide) {
      console.error('Ride is not a scheduled ride');
      return;
    }

    const scheduledTime = new Date(ride.scheduledTime);
    const now = new Date();
    const timeUntilScheduled = scheduledTime.getTime() - now.getTime();

    if (timeUntilScheduled <= 0) {
      console.error('Scheduled time is in the past');
      return;
    }

    // Calculate delays in milliseconds
    const notificationDelay = Math.max(0, timeUntilScheduled - 5 * 60 * 1000); // 5 minutes before
    const activationDelay = timeUntilScheduled; // At scheduled time
    const cancellationDelay = timeUntilScheduled + 5 * 60 * 1000; // 5 minutes after scheduled time

    // Job 1: Send notification (5 minutes before scheduled time, or immediately if less than 5 minutes)
    await scheduledRideQueue.add(
      'send-notification',
      {
        rideId: ride._id.toString(),
        jobType: 'send_notification',
      },
      {
        delay: notificationDelay,
        jobId: `scheduled-ride-notification-${ride._id}`,
        removeOnComplete: true,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    );

    // Job 2: Activate ride at scheduled time (change status to REQUESTED and start driver search)
    await scheduledRideQueue.add(
      'activate-ride',
      {
        rideId: ride._id.toString(),
        jobType: 'activate_ride',
      },
      {
        delay: activationDelay,
        jobId: `scheduled-ride-activate-${ride._id}`,
        removeOnComplete: true,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    );

    // Job 3: Cancel ride if no response after scheduled time + 5 minutes
    await scheduledRideQueue.add(
      'cancel-if-no-response',
      {
        rideId: ride._id.toString(),
        jobType: 'cancel_if_no_response',
      },
      {
        delay: cancellationDelay,
        jobId: `scheduled-ride-cancel-${ride._id}`,
        removeOnComplete: true,
        attempts: 2,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    );

    console.log(
      `✅ Scheduled ride ${ride._id} added to queue. Notification: ${Math.floor(notificationDelay / 1000 / 60)}min, Activation: ${Math.floor(activationDelay / 1000 / 60)}min, Cancellation: ${Math.floor(cancellationDelay / 1000 / 60)}min`,
    );
  } catch (error) {
    console.error('Error adding scheduled ride to queue:', error);
    // Don't throw error - ride is already created, just log it
  }
};

const cleanupFailedRide = async (rideId) => {
  try {
    await RideModel.findByIdAndDelete(rideId);
    await stopDriverSearch(rideId);
    console.log(`Cleaned up failed ride: ${rideId}`);
  } catch (error) {
    console.error(`Failed to cleanup ride ${rideId}:`, error);
  }
};
