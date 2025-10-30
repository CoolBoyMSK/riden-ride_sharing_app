import {
  upsertVehicleValidation,
  patchVehicleValidation,
} from '../../../../validations/vehicle.js';
import { handleResponse } from '../../../../utils/handleRespone.js';
import {
  getVehicle,
  updateDriverVehicleRequest,
  upsertVehicle,
} from '../../../../services/User/driver/VehicleManagement/index.js';
import { uploadDriverImage } from '../../../../utils/s3Uploader.js';

export function addOrReplaceVehicle(req, res) {
  return handleResponse(
    {
      handler: async ({ driverId, vehicle }, resp) => {
        if (req.file) {
          const imageUrl = await uploadDriverImage(driverId, req.file);
          vehicle.imageUrl = imageUrl;
        }
        return upsertVehicle({ driverId, vehicle }, resp);
      },
      validationFn: () => upsertVehicleValidation(req.body),
      handlerParams: [{ driverId: req.user.id, vehicle: req.body }],
      successMessage: 'Vehicle details saved',
    },
    req,
    res,
  );
}

export function viewVehicle(req, res) {
  return handleResponse(
    {
      handler: getVehicle,
      handlerParams: [{ driverId: req.user.id }],
      successMessage: 'Fetched vehicle details',
    },
    req,
    res,
  );
}

export function updateDriverVehicleRequestController(req, res) {
  return handleResponse(
    {
      handler: async (user, file, vehicle, resp) => {
        if (file) {
          const imageUrl = await uploadDriverImage(user._id, file);
          vehicle.imageUrl = imageUrl;
        }
        return updateDriverVehicleRequest(user, vehicle, resp);
      },
      validationFn: () => patchVehicleValidation(req.body),
      handlerParams: [req.user, req.file, req.body],
      successMessage: 'Vehicle update request sent successfully',
    },
    req,
    res,
  );
}
