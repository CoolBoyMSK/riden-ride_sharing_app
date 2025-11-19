import {
  createRide,
  findActiveRideByPassenger,
  findScheduledRideByPassenger,
  updateRideByRideId,
  findRideByRideId,
} from '../../../dal/ride.js';
import {
  findPassengerByUserId,
  findPassengerData,
} from '../../../dal/passenger.js';
import {
  analyzeSurgePricing,
  startProgressiveDriverSearch,
  updateExistingRidesSurgePricing,
  findFareConfigurationForLocation,
  isAirportRide,
} from '../../../dal/driver.js';
import { validatePromoCode } from '../../../dal/promo_code.js';
import { calculateEstimatedFare } from './fareCalculationService.js';
import { getNearbyDriversCount } from './driverMatchingService.js';
import {
  notifyUser,
  createAdminNotification,
} from '../../../dal/notification.js';
import { CAR_TYPES, PASSENGER_ALLOWED } from '../../../enums/carType.js';

// Calculate distance using simple Haversine formula (for estimation)
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

// Estimate duration based on distance (simple calculation)
const estimateDuration = (distance) => {
  const averageSpeed = 30; // km/h in city traffic
  return Math.ceil((distance / averageSpeed) * 60); // minutes
};

// Get fare estimate
export const getFareEstimate = async (
  pickupLocation,
  dropoffLocation,
  carType,
  promoCode = null,
) => {
  try {
    // Calculate distance and duration
    const distance = await calculateDistance(pickupLocation, dropoffLocation);
    const duration = estimateDuration(distance);

    const fareConfig = await findFareConfigurationForLocation(
      pickupLocation.coordinates,
      carType,
    );

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

    // Get nearby drivers count
    const driversInfo = await getNearbyDriversCount(pickupLocation, carType);

    return {
      success: true,
      estimate: {
        distance: Math.round(distance * 100) / 100, // Round to 2 decimal places
        estimatedDuration: duration,
        fareBreakdown: fareResult.fareBreakdown,
        estimatedFare: fareResult.estimatedFare,
        promoDetails: fareResult.promoDetails,
        currency: fareResult.currency,
        availableDrivers: driversInfo.count,
        estimatedWaitTime: driversInfo.estimatedWaitTime,
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

export const bookRide = async (userId, rideData) => {
  const startTime = Date.now();
  let ride = null;

  try {
    const {
      pickupLocation,
      dropoffLocation,
      carType,
      bookedFor,
      bookedForName,
      bookedForPhoneNumber,
      paymentMethod,
      promoCode,
      scheduledTime,
      specialRequests,
      cardId,
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

    // Validate and apply promo code
    // const promoValidation = await validateAndApplyPromoCode(promoCode);
    // if (!promoValidation.success) return promoValidation;
    // const { promoDetails, promoDiscount } = promoValidation;

    // Get fare configuration (reuse from surge analysis if available, otherwise fetch)
    // const fareConfig =
    //   surgeAnalysis.fareConfigType === 'default'
    //     ? await findFareConfigurationForLocation(
    //         pickupLocation.coordinates,
    //         carType,
    //       )
    //     : {
    //         zone: surgeAnalysis.zoneName
    //           ? { name: surgeAnalysis.zoneName }
    //           : null,
    //       };

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
      if (timeDifference < 30 * 60 * 1000) {
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
      cardId,
    );
    if (!paymentValidation.success) return paymentValidation;

    // Create ride record
    ride = await createRideRecord({
      passenger,
      pickupLocation,
      dropoffLocation,
      carType,
      paymentMethod,
      cardId,
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

      return {
        success: true,
        message: 'Scheduling request sent successfully',
        data: ride,
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
      data: ride,
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

// Helper functions for better organization
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

// const validateAndApplyPromoCode = async (promoCode) => {
//   if (!promoCode) {
//     return { success: true, promoDetails: null, promoDiscount: 0 };
//   }

//   const validPromo = await validatePromoCode(promoCode);
//   if (!validPromo) {
//     return {
//       success: false,
//       message: 'Invalid or expired promo code',
//     };
//   }

//   return {
//     success: true,
//     promoDetails: {
//       code: validPromo.code,
//       discount: validPromo.discount,
//       isApplied: true,
//     },
//     promoDiscount: validPromo.discount,
//   };
// };

const validatePaymentMethod = async (passenger, paymentMethod, cardId) => {
  if (paymentMethod === 'CARD') {
    if (!cardId) {
      return {
        success: false,
        message: 'Card ID is required',
      };
    } else if (!passenger.paymentMethodIds?.length) {
      return {
        success: false,
        message: 'No cards available. Please add a card.',
      };
    } else if (!passenger.paymentMethodIds.includes(cardId)) {
      return {
        success: false,
        message: 'Please add a valid card',
      };
    }
  } else {
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
    cardId,
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
  } = params;

  const ridePayload = {
    passengerId: passenger._id,
    pickupLocation,
    dropoffLocation,
    carType,
    paymentMethod,
    ...(paymentMethod === 'CARD' && { cardId }),
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

const cleanupFailedRide = async (rideId) => {
  try {
    await RideModel.findByIdAndDelete(rideId);
    await stopDriverSearch(rideId);
    console.log(`Cleaned up failed ride: ${rideId}`);
  } catch (error) {
    console.error(`Failed to cleanup ride ${rideId}:`, error);
  }
};

export const cancelRide = async (rideId, userId, reason = null) => {
  try {
    // Find the ride
    const ride = await findRideByRideId(rideId);
    if (!ride) {
      return {
        success: false,
        message: 'Ride not found',
      };
    }

    // Check if user is the passenger
    const passenger = await findPassengerByUserId(userId);
    if (
      !passenger ||
      ride.passengerId.toString() !== passenger._id.toString()
    ) {
      return {
        success: false,
        message: 'Unauthorized to cancel this ride',
      };
    }

    // Check if ride can be cancelled
    const cancellableStatuses = [
      'REQUESTED',
      'DRIVER_ASSIGNED',
      'DRIVER_ARRIVING',
    ];
    if (!cancellableStatuses.includes(ride.status)) {
      return {
        success: false,
        message: `Cannot cancel ride. Current status: ${ride.status}`,
      };
    }

    // Update ride status
    const updatedRide = await updateRideByRideId(rideId, {
      status: 'CANCELLED_BY_PASSENGER',
      cancelledBy: 'passenger',
      cancellationReason: reason,
      paymentStatus: 'CANCELLED',
    });

    // Release driver if assigned
    if (ride.driverId) {
      const { releaseDriver } = await import('./driverMatchingService.js');
      await releaseDriver(ride.driverId);
    }

    return {
      success: true,
      message: 'Ride cancelled successfully',
      ride: updatedRide,
    };
  } catch (error) {
    console.error('Ride cancellation error:', error);
    return {
      success: false,
      message: 'Failed to cancel ride. Please try again.',
      error: error.message,
    };
  }
};

// Get available car types with driver counts
export const getAvailableCarTypes = async (pickupLocation) => {
  try {
    const { CAR_TYPES } = await import('../../../enums/carType.js');

    const carTypesWithInfo = await Promise.all(
      CAR_TYPES.map(async (carType) => {
        const driversInfo = await getNearbyDriversCount(
          pickupLocation,
          carType,
        );
        return {
          type: carType,
          availableDrivers: driversInfo.count,
          estimatedWaitTime: driversInfo.estimatedWaitTime,
        };
      }),
    );

    return {
      success: true,
      carTypes: carTypesWithInfo,
    };
  } catch (error) {
    return {
      success: false,
      message: 'Failed to get available car types',
      error: error.message,
    };
  }
};
