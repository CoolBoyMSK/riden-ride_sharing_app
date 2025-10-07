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

export const addDestination = async (
  user,
  { location, title, address },
  resp,
) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const driver = await findDriverByUserId(user._id);
    if (!driver) {
      await session.abortTransaction();
      session.endSession();

      resp.error = true;
      resp.error_message = 'Failed to fetch driver';
      return resp;
    }

    const destination = await createDestination(
      driver._id,
      location,
      title,
      address,
      { session },
    );
    if (!destination) {
      await session.abortTransaction();
      session.endSession();

      resp.error = true;
      resp.error_message = 'Failed to create destination';
      return resp;
    }

    await session.commitTransaction();
    session.endSession();

    resp.data = destination;
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

export const fetchDestinations = async (user, resp) => {
  try {
    const driver = await findDriverByUserId(user._id);
    if (!driver) {
      resp.error = true;
      resp.error_essage = 'Failed to find Driver';
      return resp;
    }

    const destinations = await findAllDestination(driver._id);
    if (!destinations) {
      resp.error = true;
      resp.error_message = 'Failed to fetch destinations';
      return resp;
    }

    resp.data = destinations;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'something went wrong';
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

export const editDestination = async (
  user,
  { id },
  { location, title, address },
  resp,
) => {
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

    const updated = await updateDestinationById(
      id,
      {
        location,
        title,
        address,
      },
      { session },
    );
    if (!updated) {
      await session.abortTransaction();
      session.endSession();

      resp.error = true;
      resp.error_essage = 'Failed to edit destination';
      return resp;
    }

    await session.commitTransaction();
    session.endSession();

    resp.data = updated;
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

export const toggleDestination = async (user, resp) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const updated = await updateDriverByUserId(
      user._id,
      [{ $set: { isDestination: { $not: '$isDestination' } } }],
      { session },
    );
    if (!updated) {
      await session.abortTransaction();
      session.endSession();

      resp.error = true;
      resp.error_message = 'Failed to toggle destination';
      return resp;
    }

    await session.commitTransaction();
    session.endSession();

    resp.data = updated;
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
