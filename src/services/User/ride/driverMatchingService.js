import { 
  findAvailableDriversNearby, 
  updateDriverAvailability,
  updateRideById 
} from '../../../dal/ride.js';

// Calculate distance between two points using Haversine formula
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  
  return distance;
};

// Find and assign driver to ride
export const findAndAssignDriver = async (rideId, pickupLocation, carType, maxRadius = 10000) => {
  try {
    // Find available drivers nearby
    const availableDrivers = await findAvailableDriversNearby(
      pickupLocation.coordinates, 
      carType, 
      maxRadius
    );
    
    // Filter out drivers without proper driver profile
    const validDrivers = availableDrivers.filter(driverLocation => 
      driverLocation.driverId && 
      driverLocation.driverId.vehicle && 
      driverLocation.driverId.vehicle.type === carType
    );
    
    if (validDrivers.length === 0) {
      return {
        success: false,
        message: 'No drivers available in your area',
        availableDriversCount: 0
      };
    }
    
    // Sort drivers by distance from pickup location
    const driversWithDistance = validDrivers.map(driverLocation => {
      const distance = calculateDistance(
        pickupLocation.coordinates[1], // latitude
        pickupLocation.coordinates[0], // longitude
        driverLocation.location.coordinates[1],
        driverLocation.location.coordinates[0]
      );
      
      return {
        ...driverLocation,
        distanceFromPickup: distance
      };
    });
    
    // Sort by distance (closest first)
    driversWithDistance.sort((a, b) => a.distanceFromPickup - b.distanceFromPickup);
    
    // Try to assign the closest driver
    const selectedDriver = driversWithDistance[0];
    
    try {
      // Update driver availability
      await updateDriverAvailability(
        selectedDriver.driverId._id, 
        false, // not available
        rideId
      );
      
      // Update ride with assigned driver
      const updatedRide = await updateRideById(rideId, {
        driverId: selectedDriver.driverId._id,
        status: 'DRIVER_ASSIGNED',
        driverAssignedAt: new Date()
      });
      
      // Emit real-time notification to both passenger and driver
      try {
        const { getIO, emitToUser } = await import('../../../realtime/socket.js');
        const { findRideById } = await import('../../../dal/ride.js');
        
        const io = getIO();
        if (io) {
          // Get full ride details with populated user IDs
          const fullRide = await findRideById(updatedRide._id);
          
          if (fullRide) {
            const passengerUserId = fullRide.passengerId?.userId?.toString();
            const driverUserId = fullRide.driverId?.userId?.toString();
            
            const rideAcceptedData = {
              rideId: fullRide.rideId,
              status: 'DRIVER_ASSIGNED',
              driver: {
                id: selectedDriver.driverId._id,
                vehicle: selectedDriver.driverId.vehicle,
                location: selectedDriver.location,
                estimatedArrivalTime: Math.ceil(selectedDriver.distanceFromPickup * 2)
              },
              timestamp: new Date()
            };
            
            // Notify passenger
            if (passengerUserId) {
              emitToUser(passengerUserId, 'ride:accepted', {
                ...rideAcceptedData,
                message: 'A driver has been assigned to your ride!'
              });
            }
            
            // Notify driver
            if (driverUserId) {
              emitToUser(driverUserId, 'ride:accepted', {
                ...rideAcceptedData,
                passenger: {
                  pickup: fullRide.pickupLocation,
                  dropoff: fullRide.dropoffLocation
                },
                message: 'You have been assigned a new ride!'
              });
            }
          }
        }
      } catch (socketError) {
        console.error('Failed to emit ride:accepted event:', socketError);
        // Don't fail the ride assignment if socket notification fails
      }
      
      return {
        success: true,
        assignedDriver: {
          driverId: selectedDriver.driverId._id,
          vehicle: selectedDriver.driverId.vehicle,
          location: selectedDriver.location,
          distanceFromPickup: selectedDriver.distanceFromPickup,
          estimatedArrivalTime: Math.ceil(selectedDriver.distanceFromPickup * 2) // rough estimate: 2 min per km
        },
        ride: updatedRide,
        totalAvailableDrivers: validDrivers.length
      };
      
    } catch (assignmentError) {
      // If assignment fails, try next driver
      console.error('Driver assignment failed:', assignmentError);
      
      // Try with backup drivers if available
      if (driversWithDistance.length > 1) {
        return await tryAssignBackupDriver(rideId, driversWithDistance.slice(1));
      }
      
      return {
        success: false,
        message: 'Failed to assign driver. Please try again.',
        error: assignmentError.message
      };
    }
    
  } catch (error) {
    console.error('Driver matching error:', error);
    return {
      success: false,
      message: 'Error finding drivers. Please try again.',
      error: error.message
    };
  }
};

// Try to assign backup drivers if primary assignment fails
const tryAssignBackupDriver = async (rideId, backupDrivers) => {
  for (const driver of backupDrivers.slice(0, 3)) { // Try up to 3 backup drivers
    try {
      await updateDriverAvailability(
        driver.driverId._id, 
        false, 
        rideId
      );
      
      const updatedRide = await updateRideById(rideId, {
        driverId: driver.driverId._id,
        status: 'DRIVER_ASSIGNED',
        driverAssignedAt: new Date()
      });
      
      // Emit real-time notification for backup driver assignment
      try {
        const { getIO, emitToUser } = await import('../../../realtime/socket.js');
        const { findRideById } = await import('../../../dal/ride.js');
        
        const io = getIO();
        if (io) {
          const fullRide = await findRideById(updatedRide._id);
          
          if (fullRide) {
            const passengerUserId = fullRide.passengerId?.userId?.toString();
            const driverUserId = fullRide.driverId?.userId?.toString();
            
            const rideAcceptedData = {
              rideId: fullRide.rideId,
              status: 'DRIVER_ASSIGNED',
              driver: {
                id: driver.driverId._id,
                vehicle: driver.driverId.vehicle,
                location: driver.location,
                estimatedArrivalTime: Math.ceil(driver.distanceFromPickup * 2)
              },
              timestamp: new Date()
            };
            
            if (passengerUserId) {
              emitToUser(passengerUserId, 'ride:accepted', {
                ...rideAcceptedData,
                message: 'A driver has been assigned to your ride!'
              });
            }
            
            if (driverUserId) {
              emitToUser(driverUserId, 'ride:accepted', {
                ...rideAcceptedData,
                passenger: {
                  pickup: fullRide.pickupLocation,
                  dropoff: fullRide.dropoffLocation
                },
                message: 'You have been assigned a new ride!'
              });
            }
          }
        }
      } catch (socketError) {
        console.error('Failed to emit backup driver ride:accepted event:', socketError);
      }
      
      return {
        success: true,
        assignedDriver: {
          driverId: driver.driverId._id,
          vehicle: driver.driverId.vehicle,
          location: driver.location,
          distanceFromPickup: driver.distanceFromPickup,
          estimatedArrivalTime: Math.ceil(driver.distanceFromPickup * 2)
        },
        ride: updatedRide
      };
      
    } catch (error) {
      console.error(`Backup driver assignment failed for driver ${driver.driverId._id}:`, error);
      continue;
    }
  }
  
  return {
    success: false,
    message: 'No drivers could be assigned. Please try again later.'
  };
};

// Release driver when ride is cancelled or completed
export const releaseDriver = async (driverId) => {
  try {
    await updateDriverAvailability(driverId, true, null);
    return { success: true };
  } catch (error) {
    console.error('Error releasing driver:', error);
    return { 
      success: false, 
      error: error.message 
    };
  }
};

// Get nearby drivers count for estimation
export const getNearbyDriversCount = async (pickupLocation, carType, radius = 5000) => {
  try {
    const drivers = await findAvailableDriversNearby(
      pickupLocation.coordinates, 
      carType, 
      radius
    );
    
    const validDrivers = drivers.filter(driverLocation => 
      driverLocation.driverId && 
      driverLocation.driverId.vehicle && 
      driverLocation.driverId.vehicle.type === carType
    );
    
    return {
      success: true,
      count: validDrivers.length,
      estimatedWaitTime: validDrivers.length > 0 ? 
        Math.max(2, Math.ceil(10 / validDrivers.length)) : null // More drivers = less wait time
    };
    
  } catch (error) {
    return {
      success: false,
      error: error.message,
      count: 0
    };
  }
};



