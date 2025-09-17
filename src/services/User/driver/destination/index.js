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
    resp.error_message = 'Something went wrong while adding destination';
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

    console.log(driver);

    const destinations = await findAllDestination(driver._id);
    if (!destinations) {
      resp.error = true;
      resp.error_message = 'Failed to fetch destinations';
      return resp;
    }

    console.log(destinations);

    resp.data = destinations;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = 'Something went wrong while fetching destinations';
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
    resp.error_message = 'Something went wrong while fetching destination';
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
    resp.error_message = 'Something went wrong while editing destination';
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
    resp.error_message = 'Something went wrong while deleting destination';
    return resp;
  }
};

export const toggleDestination = async (user, resp) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const updated = await updateDriverByUserId(
      user._id,
      [{ $set: { isDestination: { $not: "$isDestination" } } }],
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
    resp.error_message = 'Something went wrong while toggling destination';
    return resp;
  }
};
