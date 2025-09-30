import express from 'express';
import { registerRoute } from '../../../../utils/registerRoute.js';
import {
  fetchMyDriverDocuments,
  uploadDocumentController,
  updateDriverDocumentController,
  updateLegalAgreementController,
  getWayBillDocumentController,
  getWayBillController,
} from '../../../../controllers/User/Drivers/Documents/index.js';
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

registerRoute({
  router,
  route: '/update',
  driver_auth_enable: true,
  patch_middlewares: [uploadSingle],
  patch_method: updateDriverDocumentController,
});

registerRoute({
  router,
  route: '/update-agreement',
  driver_auth_enable: true,
  patch_method: updateLegalAgreementController,
});

registerRoute({
  router,
  route: '/certificate',
  driver_auth_enable: true,
  get_method: getWayBillDocumentController,
});

registerRoute({
  router,
  route: '/waybill',
  driver_auth_enable: true,
  get_method: getWayBillController,
});

export default router;
