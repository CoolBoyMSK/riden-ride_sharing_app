import express from 'express';
import { registerRoute } from '../../../utils/registerRoute.js';
import { uploadMany, uploadCMSFiles } from '../../../middlewares/upload.js';
import {
  getCMSPagesController,
  addCMSPageController,
  getCMSPageByIdController,
  editCMSPageController,
} from '../../../controllers/Admin/CMS/index.js';

const router = express.Router();

registerRoute({
  router,
  route: '/list',
  admin_auth_enable: true,
  get_permission: 'cms_management',
  get_method: getCMSPagesController,
});

registerRoute({
  router,
  route: '/add',
  admin_auth_enable: true,
  post_permission: 'cms_management',
  post_middlewares: [uploadCMSFiles],
  post_method: addCMSPageController,
});

registerRoute({
  router,
  route: '/get/:id',
  admin_auth_enable: true,
  get_permission: 'cms_management',
  get_method: getCMSPageByIdController,
});

registerRoute({
  router,
  route: '/edit/:id',
  admin_auth_enable: true,
  put_permission: 'cms_management',
  put_middlewares: [uploadCMSFiles],
  put_method: editCMSPageController,
});

export default router;
