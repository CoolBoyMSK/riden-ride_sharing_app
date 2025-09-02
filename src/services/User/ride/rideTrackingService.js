import {
  findRideByRideId,
  findActiveRideByPassenger,
  findActiveRideByDriver,
  updateRideByRideId,
  findRidesByPassenger,
  findRidesByDriver,
  getRideStats
} from '../../../dal/ride.js';
import { findDriverLocation, upsertDriverLocation } from '../../../dal/ride.js';
import { calculateActualFare } from './fareCalculationService.js';
import { releaseDriver } from './driverMatchingService.js';

// Get current ride status
export const getRideStatus = async (rideId) => {
  try {
    const ride = await findRideByRideId(rideId);
    if (!ride) {
      return {
        success: false,
        message: 'Ride not found'
      };
    }
    
    // Get driver location if driver is assigned
    let driverLocation = null;
    if (ride.driverId) {
      driverLocation = await findDriverLocation(ride.driverId._id);
    }
    
    return {
      success: true,
      ride: {
        rideId: ride.rideId,
        status: ride.status,
        pickupLocation: ride.pickupLocation,
        dropoffLocation: ride.dropoffLocation,
        driver: ride.driverId ? {
          name: ride.driverId.userId?.name,
          vehicle: ride.driverId.vehicle,
          location: driverLocation?.location
        } : null,
        estimatedFare: ride.estimatedFare,
        actualFare: ride.actualFare,
        fareBreakdown: ride.fareBreakdown,
        promoCode: ride.promoCode,
        paymentMethod: ride.paymentMethod,
        paymentStatus: ride.paymentStatus,
        requestedAt: ride.requestedAt,
        driverAssignedAt: ride.driverAssignedAt,
        driverArrivedAt: ride.driverArrivedAt,
        rideStartedAt: ride.rideStartedAt,
        rideCompletedAt: ride.rideCompletedAt,
        estimatedDistance: ride.estimatedDistance,
        actualDistance: ride.actualDistance,
        estimatedDuration: ride.estimatedDuration,
        actualDuration: ride.actualDuration
      }
    };
    
  } catch (error) {
    return {
      success: false,
      message: 'Failed to get ride status',
      error: error.message
    };
  }
};

// Get current active ride for passenger
export const getCurrentRide = async (userId) => {
  try {
    const { findPassengerByUserId } = await import('../../../dal/passenger.js');
    const passenger = await findPassengerByUserId(userId);
    
    if (!passenger) {
      return {
        success: false,
        message: 'Passenger profile not found'
      };
    }
    
    const activeRide = await findActiveRideByPassenger(passenger._id);
    
    if (!activeRide) {
      return {
        success: true,
        message: 'No active ride found',
        ride: null
      };
    }
    
    // Get detailed ride status
    return await getRideStatus(activeRide.rideId);
    
  } catch (error) {
    return {
      success: false,
      message: 'Failed to get current ride',
      error: error.message
    };
  }
};

// Get driver location for active ride
export const getDriverLocation = async (rideId) => {
  try {
    const ride = await findRideByRideId(rideId);
    if (!ride || !ride.driverId) {
      return {
        success: false,
        message: 'Driver not assigned to this ride'
      };
    }
    
    const driverLocation = await findDriverLocation(ride.driverId._id);
    if (!driverLocation) {
      return {
        success: false,
        message: 'Driver location not available'
      };
    }
    
    return {
      success: true,
      driverLocation: {
        coordinates: driverLocation.location.coordinates,
        heading: driverLocation.heading,
        speed: driverLocation.speed,
        lastUpdated: driverLocation.lastUpdated
      },
      driver: {
        vehicle: ride.driverId.vehicle
      }
    };
    
  } catch (error) {
    return {
      success: false,
      message: 'Failed to get driver location',
      error: error.message
    };
  }
};

// Update driver location (called by driver app)
export const updateDriverLocation = async (driverId, locationData) => {
  try {
    const { coordinates, heading, speed, accuracy } = locationData;
    
    const updatedLocation = await upsertDriverLocation(driverId, {
      location: {
        type: 'Point',
        coordinates
      },
      heading,
      speed,
      accuracy
    });
    
    return {
      success: true,
      location: updatedLocation
    };
    
  } catch (error) {
    return {
      success: false,
      message: 'Failed to update driver location',
      error: error.message
    };
  }
};

// Start ride (called by driver)
export const startRide = async (rideId, driverId) => {
  try {
    const ride = await findRideByRideId(rideId);
    if (!ride) {
      return {
        success: false,
        message: 'Ride not found'
      };
    }
    
    if (ride.driverId._id.toString() !== driverId.toString()) {
      return {
        success: false,
        message: 'Unauthorized to start this ride'
      };
    }
    
    if (ride.status !== 'DRIVER_ARRIVED') {
      return {
        success: false,
        message: `Cannot start ride. Current status: ${ride.status}`
      };
    }
    
    const updatedRide = await updateRideByRideId(rideId, {
      status: 'RIDE_STARTED',
      rideStartedAt: new Date()
    });
    
    return {
      success: true,
      message: 'Ride started successfully',
      ride: updatedRide
    };
    
  } catch (error) {
    return {
      success: false,
      message: 'Failed to start ride',
      error: error.message
    };
  }
};

// Complete ride (called by driver)
export const completeRide = async (rideId, driverId, completionData) => {
  try {
    const { actualDistance, waitingTime = 0 } = completionData;
    
    const ride = await findRideByRideId(rideId);
    if (!ride) {
      return {
        success: false,
        message: 'Ride not found'
      };
    }
    
    if (ride.driverId._id.toString() !== driverId.toString()) {
      return {
        success: false,
        message: 'Unauthorized to complete this ride'
      };
    }
    
    if (!['RIDE_STARTED', 'RIDE_IN_PROGRESS'].includes(ride.status)) {
      return {
        success: false,
        message: `Cannot complete ride. Current status: ${ride.status}`
      };
    }
    
    const completedAt = new Date();
    const actualDuration = ride.rideStartedAt ? 
      Math.ceil((completedAt - new Date(ride.rideStartedAt)) / 60000) : 0; // minutes
    
    // Calculate actual fare
    const fareResult = await calculateActualFare({
      carType: ride.carType,
      actualDistance,
      actualDuration,
      waitingTime,
      promoCode: ride.promoCode,
      rideStartedAt: ride.rideStartedAt,
      rideCompletedAt: completedAt
    });
    
    if (!fareResult.success) {
      return {
        success: false,
        message: fareResult.error
      };
    }
    
    // Update ride with completion data
    const updatedRide = await updateRideByRideId(rideId, {
      status: 'RIDE_COMPLETED',
      rideCompletedAt: completedAt,
      actualDistance,
      actualDuration,
      actualFare: fareResult.actualFare,
      fareBreakdown: fareResult.fareBreakdown,
      paymentStatus: 'PROCESSING'
    });
    
    // Release driver
    await releaseDriver(driverId);
    
    return {
      success: true,
      message: 'Ride completed successfully',
      ride: updatedRide,
      fareBreakdown: fareResult.fareBreakdown
    };
    
  } catch (error) {
    return {
      success: false,
      message: 'Failed to complete ride',
      error: error.message
    };
  }
};

// Update ride status (general purpose)
export const updateRideStatus = async (rideId, status, additionalData = {}) => {
  try {
    const ride = await findRideByRideId(rideId);
    if (!ride) {
      return {
        success: false,
        message: 'Ride not found'
      };
    }
    
    const updateData = { status, ...additionalData };
    
    // Add timestamp based on status
    switch (status) {
      case 'DRIVER_ARRIVING':
        // No specific timestamp needed
        break;
      case 'DRIVER_ARRIVED':
        updateData.driverArrivedAt = new Date();
        break;
      case 'RIDE_IN_PROGRESS':
        // This might be used for intermediate tracking
        break;
    }
    
    const updatedRide = await updateRideByRideId(rideId, updateData);
    
    return {
      success: true,
      ride: updatedRide
    };
    
  } catch (error) {
    return {
      success: false,
      message: 'Failed to update ride status',
      error: error.message
    };
  }
};

// Get ride history
export const getRideHistory = async (userId, options = {}) => {
  try {
    const { findPassengerByUserId } = await import('../../../dal/passenger.js');
    const passenger = await findPassengerByUserId(userId);
    
    if (!passenger) {
      return {
        success: false,
        message: 'Passenger profile not found'
      };
    }
    
    const rides = await findRidesByPassenger(passenger._id, options);
    
    return {
      success: true,
      rides: rides.map(ride => ({
        rideId: ride.rideId,
        status: ride.status,
        pickupLocation: ride.pickupLocation,
        dropoffLocation: ride.dropoffLocation,
        carType: ride.carType,
        actualFare: ride.actualFare || ride.estimatedFare,
        paymentMethod: ride.paymentMethod,
        paymentStatus: ride.paymentStatus,
        requestedAt: ride.requestedAt,
        rideCompletedAt: ride.rideCompletedAt,
        actualDistance: ride.actualDistance || ride.estimatedDistance,
        promoCode: ride.promoCode
      }))
    };
    
  } catch (error) {
    return {
      success: false,
      message: 'Failed to get ride history',
      error: error.message
    };
  }
};

// Get ride statistics
export const getUserRideStats = async (userId, startDate, endDate) => {
  try {
    const { findPassengerByUserId } = await import('../../../dal/passenger.js');
    const passenger = await findPassengerByUserId(userId);
    
    if (!passenger) {
      return {
        success: false,
        message: 'Passenger profile not found'
      };
    }
    
    const stats = await getRideStats(passenger._id, startDate, endDate);
    
    return {
      success: true,
      stats: stats.length > 0 ? stats[0] : {
        totalRides: 0,
        completedRides: 0,
        cancelledRides: 0,
        totalSpent: 0,
        totalDistance: 0
      }
    };
    
  } catch (error) {
    return {
      success: false,
      message: 'Failed to get ride statistics',
      error: error.message
    };
  }
};



