import mongoose from 'mongoose';
import {
  findDriverByUserId,
  createDestination,
  findAllDestination,
  findDestinationById,
  updateDestinationById,
  deleteDestinationById,
  updateDriverByUserId,
} from '../../../../dal/driver.js';
import { checkDestinationRides } from '../../../../dal/ride.js';

// Set Destination Ride (using /add endpoint)
export const addDestination = async (
  user,
  { startLocation, endLocation },
  resp,
) => {
  console.log('[addDestination] Starting - User ID:', user._id);
  console.log('[addDestination] Request data:', {
    startLocation,
    endLocation,
  });

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const driver = await findDriverByUserId(user._id, { session });
    console.log('[addDestination] Driver found:', driver ? 'Yes' : 'No');
    if (!driver) {
      await session.abortTransaction();
      session.endSession();

      resp.error = true;
      resp.error_message = 'Driver not found';
      return resp;
    }

    // Validate locations
    console.log('[addDestination] Validating locations...');
    if (!startLocation?.coordinates || !endLocation?.coordinates) {
      console.log('[addDestination] ERROR: Missing coordinates');
      console.log('[addDestination] startLocation:', startLocation);
      console.log('[addDestination] endLocation:', endLocation);
      await session.abortTransaction();
      session.endSession();
      resp.error = true;
      resp.error_message = 'Start and end locations with coordinates are required';
      return resp;
    }

    console.log('[addDestination] Checking coordinate format...');
    console.log('[addDestination] startLocation.coordinates:', startLocation.coordinates, 'Type:', typeof startLocation.coordinates, 'IsArray:', Array.isArray(startLocation.coordinates));
    console.log('[addDestination] endLocation.coordinates:', endLocation.coordinates, 'Type:', typeof endLocation.coordinates, 'IsArray:', Array.isArray(endLocation.coordinates));

    if (
      !Array.isArray(startLocation.coordinates) ||
      startLocation.coordinates.length !== 2 ||
      !Array.isArray(endLocation.coordinates) ||
      endLocation.coordinates.length !== 2
    ) {
      console.log('[addDestination] ERROR: Invalid coordinates format');
      await session.abortTransaction();
      session.endSession();
      resp.error = true;
      resp.error_message = 'Invalid coordinates format. Expected [longitude, latitude]';
      return resp;
    }

    // Ensure coordinates are numbers (convert strings to numbers if needed)
    const startCoords = [
      Number(startLocation.coordinates[0]),
      Number(startLocation.coordinates[1]),
    ];
    const endCoords = [
      Number(endLocation.coordinates[0]),
      Number(endLocation.coordinates[1]),
    ];

    console.log('[addDestination] Converted coordinates:');
    console.log('[addDestination] startCoords:', startCoords);
    console.log('[addDestination] endCoords:', endCoords);

    // Validate coordinates are valid numbers
    if (
      isNaN(startCoords[0]) ||
      isNaN(startCoords[1]) ||
      isNaN(endCoords[0]) ||
      isNaN(endCoords[1])
    ) {
      console.log('[addDestination] ERROR: Invalid coordinates - NaN detected');
      await session.abortTransaction();
      session.endSession();
      resp.error = true;
      resp.error_message = 'Invalid coordinates. Coordinates must be valid numbers';
      return resp;
    }

    // Update driver with destination ride information
    // Use $set operator explicitly for nested object updates
    const updateData = {
      $set: {
        'destinationRide.isActive': true,
        'destinationRide.startLocation': {
          coordinates: startCoords,
          address: startLocation.address || '',
          placeName: startLocation.placeName || '',
        },
        'destinationRide.endLocation': {
          coordinates: endCoords,
          address: endLocation.address || '',
          placeName: endLocation.placeName || '',
        },
        'destinationRide.activatedAt': new Date(),
        isDestination: true, // Keep this for backward compatibility
      },
    };

    console.log('[addDestination] Update data:', JSON.stringify(updateData, null, 2));
    console.log('[addDestination] Attempting to update driver...');

    const updated = await updateDriverByUserId(
      user._id,
      updateData,
      { session },
    );

    console.log('[addDestination] Update result:', updated ? 'Success' : 'Failed');
    if (updated) {
      console.log('[addDestination] Updated destinationRide:', JSON.stringify(updated.destinationRide, null, 2));
    }

    if (!updated) {
      console.log('[addDestination] ERROR: updateDriverByUserId returned null/undefined');
      await session.abortTransaction();
      session.endSession();
      resp.error = true;
      resp.error_message = 'Failed to set destination ride';
      return resp;
    }

    console.log('[addDestination] Committing transaction...');
    await session.commitTransaction();
    session.endSession();

    console.log('[addDestination] Success - Destination ride saved');
    resp.data = {
      destinationRide: updated.destinationRide,
      message: 'Destination ride activated successfully',
    };
    return resp;
  } catch (error) {
    console.error('[addDestination] CATCH ERROR - Full error:', error);
    console.error('[addDestination] CATCH ERROR - Message:', error.message);
    console.error('[addDestination] CATCH ERROR - Stack:', error.stack);
    console.error('[addDestination] CATCH ERROR - Name:', error.name);
    
    await session.abortTransaction();
    session.endSession();

    resp.error = true;
    resp.error_message = error.message || 'Something went wrong';
    return resp;
  }
};

// Get Destination Ride Status (using /get endpoint)
export const fetchDestinations = async (user, resp) => {
  try {
    const driver = await findDriverByUserId(user._id);
    if (!driver) {
      resp.error = true;
      resp.error_message = 'Driver not found';
      return resp;
    }

    // Check if driver can accept destination rides (based on daily limit)
    // Driver can accept if they have completed less than 2 destination rides today
    const canAccept = await checkDestinationRides(driver._id);

    // Return destination ride status
    resp.data = {
      destinationRide: driver.destinationRide || null,
      canAcceptDestinationRide: canAccept,
    };
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'Something went wrong';
    return resp;
  }
};

export const fetchDestinationById = async (user, { id }, resp) => {
  try {
    const driver = await findDriverByUserId(user._id);
    if (!driver) {
      resp.error = true;
      resp.error_essage = 'Failed to find Driver';
      return resp;
    }

    const destination = await findDestinationById(id, driver._id);
    if (!destination) {
      resp.error = true;
      resp.error_message = 'Failed to fetch destination';
      return resp;
    }

    resp.data = destination;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'something went wrong';
    return resp;
  }
};

// Update Destination Ride (using /edit/:id endpoint - id is ignored, updates current driver's destination ride)
export const editDestination = async (
  user,
  { id },
  { startLocation, endLocation },
  resp,
) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const driver = await findDriverByUserId(user._id, { session });
    if (!driver) {
      await session.abortTransaction();
      session.endSession();

      resp.error = true;
      resp.error_message = 'Driver not found';
      return resp;
    }

    if (!driver.destinationRide?.isActive) {
      await session.abortTransaction();
      session.endSession();
      resp.error = true;
      resp.error_message = 'No active destination ride to update';
      return resp;
    }

    const updateData = {};

    if (startLocation) {
      if (!startLocation.coordinates || !Array.isArray(startLocation.coordinates) || startLocation.coordinates.length !== 2) {
        await session.abortTransaction();
        session.endSession();
        resp.error = true;
        resp.error_message = 'Invalid start location coordinates';
        return resp;
      }
      updateData['destinationRide.startLocation'] = {
        coordinates: startLocation.coordinates,
        address: startLocation.address || driver.destinationRide.startLocation?.address || '',
        placeName: startLocation.placeName || driver.destinationRide.startLocation?.placeName || '',
      };
    }

    if (endLocation) {
      if (!endLocation.coordinates || !Array.isArray(endLocation.coordinates) || endLocation.coordinates.length !== 2) {
        await session.abortTransaction();
        session.endSession();
        resp.error = true;
        resp.error_message = 'Invalid end location coordinates';
        return resp;
      }
      updateData['destinationRide.endLocation'] = {
        coordinates: endLocation.coordinates,
        address: endLocation.address || driver.destinationRide.endLocation?.address || '',
        placeName: endLocation.placeName || driver.destinationRide.endLocation?.placeName || '',
      };
    }

    if (Object.keys(updateData).length === 0) {
      await session.abortTransaction();
      session.endSession();
      resp.error = true;
      resp.error_message = 'No update data provided. Include startLocation or endLocation to update.';
      return resp;
    }

    const updated = await updateDriverByUserId(user._id, updateData, { session });

    if (!updated) {
      await session.abortTransaction();
      session.endSession();
      resp.error = true;
      resp.error_message = 'Failed to update destination ride';
      return resp;
    }

    await session.commitTransaction();
    session.endSession();

    resp.data = {
      destinationRide: updated.destinationRide,
      message: 'Destination ride updated successfully',
    };
    return resp;
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'Something went wrong';
    return resp;
  }
};

export const deleteDestination = async (user, { id }, resp) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const driver = await findDriverByUserId(user._id);
    if (!driver) {
      await session.abortTransaction();
      session.endSession();

      resp.error = true;
      resp.error_essage = 'Failed to find Driver';
      return resp;
    }

    const success = await deleteDestinationById(id, driver._id, { session });
    if (!success) {
      await session.abortTransaction();
      session.endSession();

      resp.error = true;
      resp.error_essage = 'Failed to delete destination';
      return resp;
    }

    await session.commitTransaction();
    session.endSession();

    resp.data = {
      message: 'Destination deleted successfully',
    };
    return resp;
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'something went wrong';
    return resp;
  }
};

// Toggle Destination Ride (Activate/Deactivate using /toggle endpoint)
export const toggleDestination = async (user, resp) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const driver = await findDriverByUserId(user._id, { session });
    if (!driver) {
      await session.abortTransaction();
      session.endSession();

      resp.error = true;
      resp.error_message = 'Driver not found';
      return resp;
    }

    const isCurrentlyActive = driver.destinationRide?.isActive || false;

    let updateData;
    if (isCurrentlyActive) {
      // Deactivate destination ride
      updateData = {
        'destinationRide.isActive': false,
        'destinationRide.startLocation': null,
        'destinationRide.endLocation': null,
        'destinationRide.activatedAt': null,
        isDestination: false, // Keep this for backward compatibility
      };
    } else {
      // Activate destination ride (but need locations first)
      if (!driver.destinationRide?.startLocation?.coordinates || !driver.destinationRide?.endLocation?.coordinates) {
        await session.abortTransaction();
        session.endSession();

        resp.error = true;
        resp.error_message = 'Cannot activate destination ride. Please set start and end locations first using /add endpoint.';
        return resp;
      }

      updateData = {
        'destinationRide.isActive': true,
        'destinationRide.activatedAt': new Date(),
        isDestination: true, // Keep this for backward compatibility
      };
    }

    const updated = await updateDriverByUserId(
      user._id,
      updateData,
      { session },
    );

    if (!updated) {
      await session.abortTransaction();
      session.endSession();

      resp.error = true;
      resp.error_message = 'Failed to toggle destination ride';
      return resp;
    }

    await session.commitTransaction();
    session.endSession();

    resp.data = {
      destinationRide: updated.destinationRide,
      message: isCurrentlyActive
        ? 'Destination ride deactivated successfully'
        : 'Destination ride activated successfully',
    };
    return resp;
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'Something went wrong';
    return resp;
  }
};
