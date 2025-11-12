import {
  createRide,
  findActiveRideByPassenger,
  updateRideByRideId,
  findRideByRideId,
} from '../../../dal/ride.js';
import { findPassengerByUserId } from '../../../dal/passenger.js';
import {
  // checkSurgePricing,
  analyzeSurgePricing,
  startProgressiveDriverSearch,
  updateExistingRidesSurgePricing,
  findFareConfigurationForLocation,
  isAirportRide,
} from '../../../dal/driver.js';
import { getPassengerWallet } from '../../../dal/stripe.js';
import { validatePromoCode } from '../../../dal/promo_code.js';
import { calculateEstimatedFare } from './fareCalculationService.js';
import { getNearbyDriversCount } from './driverMatchingService.js';

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
      paymentMethod,
      promoCode,
      scheduledTime,
      specialRequests,
    } = rideData;

    // Input validation
    const validationError = validateRideInput(rideData);
    if (validationError) return validationError;

    // Find passenger profile
    const passenger = await findPassengerByUserId(userId);
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
    const promoValidation = await validateAndApplyPromoCode(promoCode);
    if (!promoValidation.success) return promoValidation;
    const { promoDetails, promoDiscount } = promoValidation;

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
        message: fareResult.error || 'Failed to calculate fare',
      };
    }

    // Validate payment method
    const paymentValidation = await validatePaymentMethod(
      passenger,
      paymentMethod,
      fareResult.estimatedFare,
    );
    if (!paymentValidation.success) return paymentValidation;
    const { wallet } = paymentValidation;

    // Create ride record
    ride = await createRideRecord({
      passenger,
      pickupLocation,
      dropoffLocation,
      carType,
      paymentMethod,
      promoDetails,
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
      wallet,
    });

    if (!ride) {
      return {
        success: false,
        message: 'Failed to create ride record',
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
  }

  return null;
};

const validateAndApplyPromoCode = async (promoCode) => {
  if (!promoCode) {
    return { success: true, promoDetails: null, promoDiscount: 0 };
  }

  const validPromo = await validatePromoCode(promoCode);
  if (!validPromo) {
    return {
      success: false,
      message: 'Invalid or expired promo code',
    };
  }

  return {
    success: true,
    promoDetails: {
      code: validPromo.code,
      discount: validPromo.discount,
      isApplied: true,
    },
    promoDiscount: validPromo.discount,
  };
};

const validatePaymentMethod = async (passenger, paymentMethod, fareAmount) => {
  if (paymentMethod === 'CARD') {
    if (!passenger.paymentMethodIds?.length) {
      return {
        success: false,
        message: 'Card(s) not available. Please add a card.',
      };
    }
    if (!passenger.defaultCardId) {
      return {
        success: false,
        message: 'Please add a default payment method',
      };
    }
  } else if (paymentMethod === 'WALLET') {
    const wallet = await getPassengerWallet(passenger._id);
    if (!wallet) {
      return {
        success: false,
        message: 'Wallet not available',
      };
    }
    if (wallet.balance < fareAmount) {
      return {
        success: false,
        message: 'Insufficient wallet funds',
      };
    }
    return { success: true, wallet };
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
    promoDetails,
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
    wallet,
  } = params;

  const ridePayload = {
    passengerId: passenger._id,
    pickupLocation,
    dropoffLocation,
    carType,
    paymentMethod,
    ...(paymentMethod === 'WALLET' && { walletId: wallet?._id }),
    ...(promoDetails && { promoCode: promoDetails }),
    scheduledTime: scheduledTime ? new Date(scheduledTime) : new Date(),
    ...(specialRequests && { specialRequests }),
    estimatedDistance: distance,
    estimatedDuration: duration,
    estimatedFare: fareResult.estimatedFare,
    fareBreakdown: fareResult.fareBreakdown,
    status: 'REQUESTED',
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
