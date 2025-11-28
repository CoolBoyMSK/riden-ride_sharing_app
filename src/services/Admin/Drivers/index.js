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
  updateDriverByUserId,
  findDriverByDriverId,
} from '../../../dal/driver.js';
import { getAllExternalAccounts } from '../../../dal/stripe.js';
import { findUserById } from '../../../dal/user/index.js';
import { uploadDriverDocumentToS3 } from '../../../utils/s3Uploader.js';
import {
  sendDriverDocumentsApprovalEmail,
  sendDriverDocumentsRejectedEmail,
  sendDriverAccountSuspendedEmail,
} from '../../../templates/emails/user/index.js';
import { notifyUser } from '../../../dal/notification.js';

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
    resp.error_message = error.message || 'something went wrong';
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

    const user = await findUserById(updated.userId);
    if (!user) {
      resp.error = true;
      resp.error_message = 'User not found';
      return resp;
    }

    await sendDriverAccountSuspendedEmail(
      user.userId?.email,
      user.userId?.name,
      reason,
    );

    resp.data = {
      id: updated._id,
      isBlocked: updated.isBlocked,
      suspension: updated.suspensions.slice(-1)[0],
    };
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'something went wrong';
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
    resp.error_message = error.message || 'something went wrong';
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
      resp.error = true;
      resp.error_message = 'Failed to delete driver or associated user';
      return resp;
    }

    await session.commitTransaction();

    resp.data = { message: 'Driver deleted successfully' };
    return resp;
  } catch (error) {
    await session.abortTransaction();
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'something went wrong';
    return resp;
  } finally {
    session.endSession();
  }
};

export const findDriverById = async ({ driverId }, resp) => {
  try {
    const driver = await findDriver(driverId);
    if (!driver) {
      resp.error = true;
      resp.error_message = 'Failed to found driver';
      return resp;
    }

    driver.paymentMethods = await getAllExternalAccounts(
      driver.driver?.stripeAccountId,
    );

    resp.data = driver;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'Something went wrong';
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

    let user = await findUserById(updated.userId);
    if (!user) {
      await session.abortTransaction();
      session.endSession();
      resp.error = true;
      resp.error_message = 'User not found';
      return resp;
    }

    if (status === 'rejected') {
      await sendDriverDocumentsRejectedEmail(
        user.userId?.email,
        user.userId?.name,
      );

      const notify = await notifyUser({
        userId: user.userId,
        title: 'Document Rejected',
        message: `Your document has been rejected`,
        module: 'support',
        metadata: { updated },
      });
      if (!notify) {
        console.error('Failed to send notification');
      }
    } else if (status === 'verified') {
      const notify = await notifyUser({
        userId: user.userId,
        title: 'Document Verified',
        message: `Your document has been verified`,
        module: 'support',
        metadata: { updated },
      });
      if (!notify) {
        console.error('Failed to send notification');
      }
    }

    const unverified = Object.values(updated.documents).filter(
      (doc) => doc.status !== 'verified',
    );
    if (unverified.length == 0) {
      await sendDriverDocumentsApprovalEmail(
        user.userId?.email,
        user.userId?.name,
      );
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
    resp.error_message = error.message || 'something went wrong';
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
    resp.error_message = error.message || 'something went wrong';
    return resp;
  }
};

export const getAllUpdateRequests = async (
  { page, limit, search, fromDate, toDate },
  resp,
) => {
  try {
    const result = await findDriverUpdateRequests(
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

    resp.data = result;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'something went wrong';
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
    resp.error_message = error.message || 'something went wrong';
    return resp;
  }
};

export const approveRequestedDriver = async ({ id }, resp) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const driver = await findDriverByDriverId(id);
    if (!driver) {
      await session.abortTransaction();
      resp.error = true;
      resp.error_message = 'Driver not found';
      return resp;
    }

    const documents = driver.documents;
    const isDocsApproved =
      documents.proofOfWork.status === 'verified' &&
      documents.profilePicture.status === 'verified' &&
      documents.driversLicense.status === 'verified' &&
      documents.commercialDrivingRecord.status === 'verified' &&
      documents.vehicleOwnerCertificateAndInsurance.status === 'verified' &&
      documents.vehicleInspection.status === 'verified';

    if (!isDocsApproved) {
      await session.abortTransaction();
      resp.error = true;
      resp.error_message = 'Documents not verified';
      return resp;
    }

    const wayBill = driver.wayBill;
    const isWayBillIssued =
      wayBill.certificateOfInsurance.status === 'issued' &&
      wayBill.recordCheckCertificate.status === 'issued';

    if (!isWayBillIssued) {
      await session.abortTransaction();
      resp.error = true;
      resp.error_message = 'Way bill not issued';
      return resp;
    }

    const isVehicleAdded =
      driver.vehicle &&
      driver.vehicle?.type.trim() &&
      driver.vehicle?.model.trim() &&
      driver.vehicle?.plateNumber.trim() &&
      driver.vehicle?.color.trim() &&
      driver.vehicle?.imageUrl.trim();

    if (!isVehicleAdded) {
      await session.abortTransaction();
      resp.error = true;
      resp.error_message = 'Vehicle not added';
      return resp;
    }

    const isPaymentMethodAdded =
      driver.payoutMethodIds && driver.payoutMethodIds.length > 0;

    if (!isPaymentMethodAdded) {
      await session.abortTransaction();
      resp.error = true;
      resp.error_message = 'Payment method not added';
      return resp;
    }

    const success = await updateDriverById(
      id,
      { isApproved: true },
      { session },
    );
    if (!success) {
      await session.abortTransaction();
      resp.error = true;
      resp.error_message = 'failed to approve driver';
      return resp;
    }

    const notify = await notifyUser({
      userId: success.userId,
      title: 'Account Approved',
      message: `Congratulations! Your driver account has been approved Riden.`,
      module: 'support',
      metadata: success,
      actionLink: '',
    });
    if (!notify) {
      console.log('Failed to send notification');
    }

    await session.commitTransaction();

    resp.data = success;
    return resp;
  } catch (error) {
    await session.abortTransaction();

    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'something went wrong';
    return resp;
  } finally {
    session.endSession();
  }
};

export const uploadWayBillDocument = async (
  { id, docType }, // id = driver.userId
  {
    insurer,
    naic,
    policy,
    operator,
    policyStartDate,
    policyEndDate,
    coveredRideStartTime,
  },
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
    if (!imageUrl) {
      resp.error = true;
      resp.error_message = 'Failed to upload waybill document';
      return resp;
    }

    let updated = await updateWayBillDocuments(id, docType, imageUrl);
    if (!updated) {
      resp.error = true;
      resp.error_message = 'Driver record not found';
      return resp;
    }

    if (docType === 'certificateOfInsurance') {
      if (insurer) {
        resp.error = true;
        resp.error_message = 'Insurer cannot be empty';
        return resp;
      } else if (NaN(naic)) {
        resp.error = true;
        resp.error_message = 'Invalid NAIC format, Must be a numeric value';
        return resp;
      } else if (policy) {
        resp.error = true;
        resp.error_message = 'Policy cannot be empty';
        return resp;
      } else if (operator) {
        resp.error = true;
        resp.error_message = 'Operator cannot be empty';
        return resp;
      } else if (
        NaN(Date.parse(policyStartDate)) ||
        NaN(Date.parse(policyEndDate))
      ) {
        resp.error = true;
        resp.error_message = 'Invalid policy start or end date';
        return resp;
      } else if (NaN(Date.parse(coveredRideStartTime))) {
        resp.error = true;
        resp.error_message = 'Invalid covered ride start time';
        return resp;
      }

      updated = await updateDriverByUserId(
        id,
        {
          $set: {
            [`wayBill.${docType}.insurer`]: insurer,
            [`wayBill.${docType}.naic`]: naic,
            [`wayBill.${docType}.policy`]: policy,
            [`wayBill.${docType}.operator`]: operator,
            [`wayBill.${docType}.policyStartDate`]: policyStartDate,
            [`wayBill.${docType}.policyEndDate`]: policyEndDate,
            [`wayBill.${docType}.coveredRideStartTime`]: coveredRideStartTime,
          },
        },
        { new: true },
      );
    }

    const wayBillNotIssued = Object.values(updated.wayBill).filter(
      (doc) => doc.status !== 'issued',
    );
    if (wayBillNotIssued.length == 0) {
      const notify = await notifyUser({
        userId: updated.userId,
        title: 'Way Bill Issued Successfully',
        message: `Your way bill has been issued`,
        module: 'support',
        metadata: { updated },
      });
      if (!notify) {
        console.error('Failed to send notification');
      }
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
