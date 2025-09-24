import express from 'express';
import { registerRoute } from '../../../utils/registerRoute.js';
import {
  findAllComplainTicketsController,
  getComplainByIdController,
  updateComplainStatusController,
  replyToComplainController,
  findAllReportsController,
  getReportByIdController,
  updateReportStatusController,
} from '../../../controllers/Admin/Support/index.js';
import { uploadMany } from '../../../middlewares/upload.js';

const router = express.Router();

registerRoute({
  router,
  route: '/',
  admin_auth_enable: true,
  get_method: findAllComplainTicketsController,
});

registerRoute({
  router,
  route: '/get',
  admin_auth_enable: true,
  get_method: getComplainByIdController,
});

registerRoute({
  router,
  route: '/edit',
  admin_auth_enable: true,
  put_method: updateComplainStatusController,
});

registerRoute({
  router,
  route: '/reply',
  admin_auth_enable: true,
  put_middlewares: [uploadMany],
  put_method: replyToComplainController,
});

registerRoute({
  router,
  route: '/reports',
  admin_auth_enable: true,
  get_method: findAllReportsController,
});

registerRoute({
  router,
  route: '/report',
  admin_auth_enable: true,
  get_method: getReportByIdController,
});

registerRoute({
  router,
  route: '/report-edit',
  admin_auth_enable: true,
  put_method: updateReportStatusController,
});

export default router;
