import {
  createRide,
  findActiveRideByPassenger,
  updateRideByRideId,
  findRideByRideId,
} from '../../../dal/ride.js';
import { findPassengerByUserId } from '../../../dal/passenger.js';
import { validatePromoCode } from '../../../dal/promo_code.js';
import { calculateEstimatedFare } from './fareCalculationService.js';
import {
  findAndAssignDriver,
  getNearbyDriversCount,
} from './driverMatchingService.js';

// Calculate distance using simple Haversine formula (for estimation)
const calculateDistance = (pickup, dropoff) => {
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
    const distance = calculateDistance(pickupLocation, dropoffLocation);
    const duration = estimateDuration(distance);

    // Calculate fare
    const fareResult = await calculateEstimatedFare(
      carType,
      distance,
      duration,
      promoCode,
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

// Book a ride
export const bookRide = async (userId, rideData) => {
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

    // Find passenger profile
    const passenger = await findPassengerByUserId(userId);
    if (!passenger) {
      return {
        success: false,
        message: 'Passenger profile not found',
      };
    }

    // Check if passenger has any active rides
    const activeRide = await findActiveRideByPassenger(passenger._id);
    if (activeRide) {
      return {
        success: false,
        message: 'You already have an active ride',
        activeRide: activeRide,
      };
    }

    // Validate payment method exists in passenger profile
    const hasPaymentMethod = passenger.paymentMethods.some(
      (pm) => pm.type === paymentMethod,
    );
    if (!hasPaymentMethod) {
      return {
        success: false,
        message:
          'Selected payment method not available. Please add payment method first.',
      };
    }

    // Calculate distance and duration
    const distance = calculateDistance(pickupLocation, dropoffLocation);
    const duration = estimateDuration(distance);

    // Validate and apply promo code if provided
    let promoDetails = null;
    if (promoCode) {
      const validPromo = await validatePromoCode(promoCode);
      if (!validPromo) {
        return {
          success: false,
          message: 'Invalid or expired promo code',
        };
      }
      promoDetails = {
        code: validPromo.code,
        discount: validPromo.discount,
        isApplied: true,
      };
    }

    // Calculate fare with promo code
    const fareResult = await calculateEstimatedFare(
      carType,
      distance,
      duration,
      promoCode,
    );

    if (!fareResult.success) {
      return {
        success: false,
        message: fareResult.error,
      };
    }

    // Create ride record
    const ridePayload = {
      passengerId: passenger._id,
      pickupLocation,
      dropoffLocation,
      carType,
      paymentMethod,
      promoCode: promoDetails,
      scheduledTime: scheduledTime ? new Date(scheduledTime) : new Date(),
      specialRequests,
      estimatedDistance: distance,
      estimatedDuration: duration,
      estimatedFare: fareResult.estimatedFare,
      fareBreakdown: fareResult.fareBreakdown,
      status: 'REQUESTED',
    };

    const newRide = await createRide(ridePayload);

    // Try to find and assign a driver
    // const driverAssignment = await findAndAssignDriver(
    //   newRide._id,
    //   pickupLocation,
    //   carType,
    // );

    // if (driverAssignment.success) {
    //   return {
    //     success: true,
    //     message: 'Ride booked successfully! Driver found.',
    //     ride: {
    //       rideId: newRide.rideId,
    //       _id: newRide._id,
    //       status: 'DRIVER_ASSIGNED',
    //       estimatedFare: fareResult.estimatedFare,
    //       fareBreakdown: fareResult.fareBreakdown,
    //       promoDetails: promoDetails,
    //       driver: driverAssignment.assignedDriver,
    //       pickupLocation,
    //       dropoffLocation,
    //       scheduledTime: newRide.scheduledTime,
    //     },
    //   };
    // } else {
      // No driver available immediately, but ride is created
      return {
        success: true,
        message: 'Ride requested successfully! Looking for nearby drivers...',
        ride: {
          rideId: newRide.rideId,
          _id: newRide._id,
          status: 'REQUESTED',
          estimatedFare: fareResult.estimatedFare,
          fareBreakdown: fareResult.fareBreakdown,
          promoDetails: promoDetails,
          pickupLocation,
          dropoffLocation,
          scheduledTime: newRide.scheduledTime,
        },
        // driverSearchInfo: {
        //   availableDriversCount: driverAssignment.availableDriversCount || 0,
        //   message: driverAssignment.message,
        // },
      };
    // }
  } catch (error) {
    console.error('Ride booking error:', error);
    return {
      success: false,
      message: 'Failed to book ride. Please try again.',
      error: error.message,
    };
  }
};

// Cancel ride
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
