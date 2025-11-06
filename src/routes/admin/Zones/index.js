import express from 'express';
import { registerRoute } from '../../../utils/registerRoute.js';
import {
  addZoneController,
  fetchAllZonesController,
  fetchZoneByIdController,
  editZoneController,
  removeZoneController,
  fetchZoneTypesController,
} from '../../../controllers/Admin/Zones/index.js';

const router = express.Router();

registerRoute({
  router,
  route: '/create',
  admin_auth_enable: true,
  post_method: addZoneController,
});

registerRoute({
  router,
  route: '/',
  admin_auth_enable: true,
  get_method: fetchAllZonesController,
});

registerRoute({
  router,
  route: '/get',
  admin_auth_enable: true,
  get_method: fetchZoneByIdController,
});

registerRoute({
  router,
  route: '/update',
  admin_auth_enable: true,
  put_method: editZoneController,
});

registerRoute({
  router,
  route: '/delete',
  admin_auth_enable: true,
  delete_method: removeZoneController,
});

registerRoute({
  router,
  route: '/types',
  admin_auth_enable: true,
  get_method: fetchZoneTypesController,
});

export default router;
