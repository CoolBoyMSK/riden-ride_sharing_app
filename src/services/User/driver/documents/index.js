import {
  findDriverDocuments,
  updateDriverDocumentRecord,
} from '../../../../dal/driver.js';
import { uploadDriverDocumentToS3 } from '../../../../utils/s3Uploader.js';

export const getDriverDocuments = async (driverId, resp) => {
  const docs = await findDriverDocuments(driverId);
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

  console.log(file)

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
