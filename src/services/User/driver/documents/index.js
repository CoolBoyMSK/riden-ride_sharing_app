import mongoose from 'mongoose';
import {
  findDriverDocuments,
  updateDriverDocumentRecord,
  findDriverByUserId,
  createDriverUpdateRequest,
  updateDriverLegalAgreement,
  findWayBill,
  findDriverWayBill,
} from '../../../../dal/driver.js';
import { uploadDriverDocumentToS3 } from '../../../../utils/s3Uploader.js';
import { createAdminNotification } from '../../../../dal/notification.js';
import env from '../../../../config/envConfig.js';

export const getDriverDocuments = async (driverId, resp) => {
  const driver = await findDriverByUserId(driverId);
  if (!driver) {
    resp.error = true;
    resp.error_message = 'Driver not found';
    return resp;
  }

  const docs = await findDriverDocuments(driver._id);
  if (!docs) {
    resp.error = true;
    resp.error_message = 'Driver not found';
    return resp;
  }
  resp.data = docs.documents;
  return resp;
};

export const uploadDriverDocument = async (user, file, docType, resp) => {
  if (!file) {
    resp.error = true;
    resp.error_message = 'No file provided';
    return resp;
  }

  const imageUrl = await uploadDriverDocumentToS3(user._id, docType, file);

  const updated = await updateDriverDocumentRecord(user._id, docType, imageUrl);
  if (!updated) {
    resp.error = true;
    resp.error_message = 'Driver record not found';
    return resp;
  }

  const notify = await createAdminNotification({
    title: 'Document Submission',
    message: `A Driver has uploaded new documents for verification.`,
    metadata: updated,
    module: 'driver_management',
    type: 'ALERT',
    actionLink: `${env.FRONTEND_URL}/api/admin/drivers/fetch/${updated._id}`,
  });
  if (!notify) {
    console.error('Failed to send notification');
  }

  resp.data = updated.documents[docType];
  return resp;
};

export const updateDriverDocument = async (user, file, docType, resp) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const driver = await findDriverByUserId(user._id);
    if (!driver) {
      await session.abortTransaction();
      session.endSession();

      resp.error = true;
      resp.error_message = 'Driver not found';
      return resp;
    }

    if (!file) {
      await session.abortTransaction();
      session.endSession();

      resp.error = true;
      resp.error_message = 'No file provided';
      return resp;
    }

    const oldDoc = driver.documents?.[docType] || {};
    const oldValue = oldDoc.imageUrl || '';

    const newValue = await uploadDriverDocumentToS3(driver._id, docType, file);
    if (!newValue) {
      await session.abortTransaction();
      session.endSession();

      resp.error = true;
      resp.error_message = 'Failed to upload document';
      return resp;
    }

    const request = await createDriverUpdateRequest(
      user._id,
      docType,
      oldValue,
      newValue,
    );

    if (!request) {
      await session.abortTransaction();
      session.endSession();

      resp.error = true;
      resp.error_message = 'Failed to create document update request';
      return resp;
    }

    await session.commitTransaction();
    session.endSession();

    const notify = await createAdminNotification({
      title: 'Document Update Request',
      message: `A Driver has submitted document update request for verification.`,
      metadata: { driver, request },
      module: 'driver_management',
      type: 'ALERT',
      actionLink: `${env.FRONTEND_URL}/api/admin/drivers/update-requests?page=1&limit=10&search=${user.email}`,
    });
    if (!notify) {
      console.error('Failed to send notification');
    }

    resp.data = request;
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

export const updateLegalAgreement = async (user, { status }, resp) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const driver = await findDriverByUserId(user.id);
    if (!driver) {
      await session.abortTransaction();
      session.endSession();

      resp.error = true;
      resp.error_message = 'Driver not found';
      return resp;
    }

    const updated = await updateDriverLegalAgreement(
      driver._id,
      status,
      session,
    );
    if (!updated) {
      await session.commitTransaction();
      session.endSession();

      resp.error = true;
      resp.error_message = 'Failed to update legal agreement status';
      return resp;
    }

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

export const getWayBillDocument = async (user, { docType }, resp) => {
  try {
    const driver = await findDriverByUserId(user._id);
    if (!driver) {
      resp.error = true;
      resp.error_message = 'Driver not found';
      return resp;
    }

    const docs = await findWayBill(driver._id, docType);
    if (!docs) {
      resp.error = true;
      resp.error_message = 'Driver not found';
      return resp;
    }
    resp.data = docs;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'Something went wrong';
    return resp;
  }
};

export const getWayBill = async (user, resp) => {
  try {
    const driver = await findDriverByUserId(user._id);
    if (!driver) {
      resp.error = true;
      resp.error_message = 'Driver not found';
      return resp;
    }

    const success = await findDriverWayBill(driver._id);
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to fetch way bill';
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
