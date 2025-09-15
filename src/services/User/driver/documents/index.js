import mongoose from 'mongoose';
import {
  findDriverDocuments,
  updateDriverDocumentRecord,
  findDriverByUserId,
  createDriverUpdateRequest,
  updateDriverLegalAgreement,
} from '../../../../dal/driver.js';
import { uploadDriverDocumentToS3 } from '../../../../utils/s3Uploader.js';

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

  const imageUrl = await uploadDriverDocumentToS3(user.id, docType, file);

  const updated = await updateDriverDocumentRecord(user.id, docType, imageUrl);
  if (!updated) {
    resp.error = true;
    resp.error_message = 'Driver record not found';
    return resp;
  }

  resp.data = updated.documents[docType];
  return resp;
};

export const updateDriverDocument = async (user, file, docType, resp) => {
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
      user.id,
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

    resp.data = request;
    return resp;
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message =
      'Something went wrong while sending doucment update request';
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
    resp.error_message = 'Something went wrong while updating legal agreement';
    return resp;
  }
};
