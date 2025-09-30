import mongoose from 'mongoose';
import {
  addDriverSuspension,
  removeDriverSuspension,
  addDriverBlock,
  removeDriverBlock,
  getfindDrivers,
  deleteDriver,
  findDriver,
  updateDocumentStatus,
  findDriverUpdateRequests,
  updateDriverRequest,
  updateDriverById,
  updateWayBillDocuments,
  findWayBill,
  updateWayBillStatus,
} from '../../../dal/driver.js';
import { uploadDriverDocumentToS3 } from '../../../utils/s3Uploader.js';

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
      isApproved: isApproved === 'true' ? true : false,
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

export const suspendDriver = async (driverId, { reason, endDate }, resp) => {
  try {
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
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = 'Something went wrong while suspending driver';
    return resp;
  }
};

export const unsuspendDriver = async (driverId, resp) => {
  try {
    const updated = await removeDriverSuspension(driverId);
    if (!updated) {
      resp.error = true;
      resp.error_message = 'Driver not found';
      return resp;
    }
    resp.data = { id: updated._id, isBlocked: updated.isBlocked };
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = 'Something went wrong while unsuspending driver';
    return resp;
  }
};

export const deleteDriverByIdAPI = async ({ driverId }, resp) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const success = await deleteDriver(driverId, session);

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

export const findDriverById = async ({ driverId }, resp) => {
  try {
    const driver = await findDriver(driverId);
    if (!driver) {
      resp.error = true;
      resp.error_message = 'Failed to fond driver';
      return resp;
    }

    resp.data = driver;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = 'Something went wrong while fetching driver';
    return resp;
  }
};

export const updateDriverDocumentStatus = async (
  { id, docType, status },
  resp,
) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const updated = await updateDocumentStatus(id, docType, status, {
      session,
    });
    if (!updated) {
      await session.abortTransaction();
      session.endSession();

      resp.error = true;
      resp.error_message = 'Failed to Update Document Status';
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
    resp.error_messagte = 'Something went wrong while updating document status';
    return resp;
  }
};

export const blockDriver = async ({ driverId }, resp) => {
  try {
    const updated = await addDriverBlock(driverId);
    if (!updated) {
      resp.error = true;
      resp.error_message = 'Failed to block driver';
      return resp;
    }
    resp.data = { id: updated._id, isBlocked: updated.isBlocked };
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = 'Something went wrong while blocking driver';
    return resp;
  }
};

export const unblockDriver = async ({ driverId }, resp) => {
  try {
    const updated = await removeDriverBlock(driverId);
    if (!updated) {
      resp.error = true;
      resp.error_message = 'Failed to unblock driver';
      return resp;
    }

    resp.data = { id: updated._id, isBlocked: updated.isBlocked };
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = 'Something went wrong while unblocking driver';
    return resp;
  }
};

export const getAllUpdateRequests = async (
  { page, limit, search, fromDate, toDate },
  resp,
) => {
  try {
    const result = await findDriverUpdateRequests(
      {},
      page,
      limit,
      search,
      fromDate,
      toDate,
    );
    if (!result) {
      resp.error = true;
      resp.error_message = 'Failed to fetch requests';
      return resp;
    }

    resp.data = {
      requests: result.data,
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
    };

    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = 'Something went wrong while Fetching update requests';
    return resp;
  }
};

export const toggleUpdateRequest = async ({ status, id }, resp) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const updated = await updateDriverRequest(id, status, { session });

    if (!updated) {
      await session.abortTransaction();
      session.endSession();

      resp.error = true;
      resp.error_message = 'Failed to toggle request';
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
    resp.error_message =
      'Something went wrong while toggling the update request';
    return resp;
  }
};

export const approveRequestedDriver = async ({ id }, resp) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const success = await updateDriverById(
      id,
      { isApproved: true },
      { session },
    );
    if (!success) {
      await session.abortTransaction();
      session.endSession();

      resp.error = true;
      resp.error_message = 'failed to approve driver';
      return resp;
    }

    await session.commitTransaction();
    session.endSession();

    resp.data = success;
    return resp;
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = 'Something went wrong while approving driver';
    return resp;
  }
};

export const uploadWayBillDocument = async (
  { id, docType }, // id = driver.userId
  file,
  resp,
) => {
  try {
    if (!file) {
      resp.error = true;
      resp.error_message = 'No file provided';
      return resp;
    }

    const imageUrl = await uploadDriverDocumentToS3(id, docType, file);
    console.log(imageUrl);

    const updated = await updateWayBillDocuments(id, docType, imageUrl);
    if (!updated) {
      resp.error = true;
      resp.error_message = 'Driver record not found';
      return resp;
    }

    resp.data = updated.wayBill[docType];
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'Something went wrong';
    return resp;
  }
};

export const getWayBillDocument = async ({ id, docType }, resp) => {
  // id = driver._id
  try {
    const success = await findWayBill(id, docType);
    if (!success) {
      resp.error = true;
      resp.error_message = `Failed to fetch ${docType}`;
      return resp;
    }

    resp.data = success;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'Something went wrong';
    return resp;
  }
};
