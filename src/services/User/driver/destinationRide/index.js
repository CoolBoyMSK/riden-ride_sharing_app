import mongoose from 'mongoose';
import {
  findDriverByUserId,
  updateDriverByUserId,
} from '../../../../dal/driver.js';
import { checkDestinationRides } from '../../../../dal/ride.js';

export const setDestinationRide = async (user, { startLocation, endLocation }, resp) => {
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

    // Validate locations
    if (!startLocation?.coordinates || !endLocation?.coordinates) {
      await session.abortTransaction();
      session.endSession();
      resp.error = true;
      resp.error_message = 'Start and end locations with coordinates are required';
      return resp;
    }

    if (
      !Array.isArray(startLocation.coordinates) ||
      startLocation.coordinates.length !== 2 ||
      !Array.isArray(endLocation.coordinates) ||
      endLocation.coordinates.length !== 2
    ) {
      await session.abortTransaction();
      session.endSession();
      resp.error = true;
      resp.error_message = 'Invalid coordinates format. Expected [longitude, latitude]';
      return resp;
    }

    // Update driver with destination ride information
    const updated = await updateDriverByUserId(
      user._id,
      {
        'destinationRide.isActive': true,
        'destinationRide.startLocation': {
          coordinates: startLocation.coordinates,
          address: startLocation.address || '',
          placeName: startLocation.placeName || '',
        },
        'destinationRide.endLocation': {
          coordinates: endLocation.coordinates,
          address: endLocation.address || '',
          placeName: endLocation.placeName || '',
        },
        'destinationRide.activatedAt': new Date(),
        isDestination: true, // Keep this for backward compatibility
      },
      { session },
    );

    if (!updated) {
      await session.abortTransaction();
      session.endSession();
      resp.error = true;
      resp.error_message = 'Failed to set destination ride';
      return resp;
    }

    await session.commitTransaction();
    session.endSession();

    resp.data = {
      destinationRide: updated.destinationRide,
      message: 'Destination ride activated successfully',
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

export const getDestinationRide = async (user, resp) => {
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

export const updateDestinationRide = async (
  user,
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

export const removeDestinationRide = async (user, resp) => {
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

    const updated = await updateDriverByUserId(
      user._id,
      {
        'destinationRide.isActive': false,
        'destinationRide.startLocation': null,
        'destinationRide.endLocation': null,
        'destinationRide.activatedAt': null,
        isDestination: false, // Keep this for backward compatibility
      },
      { session },
    );

    if (!updated) {
      await session.abortTransaction();
      session.endSession();
      resp.error = true;
      resp.error_message = 'Failed to remove destination ride';
      return resp;
    }

    await session.commitTransaction();
    session.endSession();

    resp.data = {
      message: 'Destination ride removed successfully',
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











