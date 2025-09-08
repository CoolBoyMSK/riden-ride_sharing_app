import express from 'express';
import { registerRoute } from '../../../../utils/registerRoute.js';
import {
  fetchMyDriverDocuments,
  uploadDocumentController,
} from '../../../../controllers/User/Drivers/Documents/index.js';
import { uploadDriverDocumentToS3 } from '../../../../utils/s3Uploader.js';
import { uploadSingle } from '../../../../middlewares/upload.js';

const router = express.Router();

registerRoute({
  router,
  route: '/status',
  driver_auth_enable: true,
  get_method: fetchMyDriverDocuments,
});

registerRoute({
  router,
  route: '/upload/:docType',
  driver_auth_enable: true,
  put_middlewares: [uploadSingle],
  put_method: uploadDocumentController,
});

export default router;
