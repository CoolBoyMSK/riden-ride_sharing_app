import mongoose from 'mongoose';
import {
  addDriverSuspension,
  removeDriverBlock,
  getfindDrivers,
} from '../../../dal/driver.js';

export const getAllDrivers = async (
  { page, limit, search, fromDate, toDate, isApproved },
  resp,
) => {
  try {
    const items = await getfindDrivers({
      page,
      limit,
      search,
      fromDate,
      toDate,
      isApproved,
    });
    if (!items) {
      resp.error = true;
      resp.error_message = 'Failed to fetch derivers';
      return resp;
    }

    resp.data = items;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = 'Something went wrong while fetching drivers';
    return resp;
  }
};

export const suspendDriver = async (driverId, reason, endDate, resp) => {
  const updated = await addDriverSuspension(driverId, reason, endDate);
  if (!updated) {
    resp.error = true;
    resp.error_message = 'Driver not found';
    return resp;
  }
  resp.data = {
    id: updated._id,
    isBlocked: updated.isBlocked,
    suspension: updated.suspensions.slice(-1)[0],
  };
  return resp;
};

export const unsuspendDriver = async (driverId, resp) => {
  const updated = await removeDriverBlock(driverId);
  if (!updated) {
    resp.error = true;
    resp.error_message = 'Driver not found';
    return resp;
  }
  resp.data = { id: updated._id, isBlocked: updated.isBlocked };
  return resp;
};

export const deleteDriverByIdAPI = async ({ driverId }, resp) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const success = await deleteDriverTransaction(driverId, session);

    if (!success) {
      await session.abortTransaction();
      session.endSession();

      resp.error = true;
      resp.error_message = 'Failed to delete driver or associated user';
      return resp;
    }

    await session.commitTransaction();
    session.endSession();

    resp.data = { message: 'Driver deleted successfully' };
    return resp;
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = 'Something went wrong while deleting driver';
    return resp;
  }
};
