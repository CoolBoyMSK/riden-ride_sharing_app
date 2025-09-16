import express from 'express';
import { registerRoute } from '../../../../utils/registerRoute.js';
import {
  addOrReplaceVehicle,
  viewVehicle,
  updateDriverVehicleRequestController,
} from '../../../../controllers/User/Drivers/VehicleManagement/index.js';
import { uploadSingle } from '../../../../middlewares/upload.js';

const router = express.Router();

registerRoute({
  router,
  route: '/',
  driver_auth_enable: true,
  get_method: viewVehicle,
  post_middlewares: [uploadSingle],
  post_method: addOrReplaceVehicle,
  patch_middlewares: [uploadSingle],
  patch_method: updateDriverVehicleRequestController,
});

export default router;
