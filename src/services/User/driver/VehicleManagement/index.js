import {
  findVehicleByUserId,
  upsertVehicle as dalUpsertVehicle,
  patchVehicleFields,
} from '../../../../dal/driver.js';

export async function upsertVehicle(params, resp) {
  const { driverId, vehicle } = params;
  const updated = await dalUpsertVehicle(driverId, vehicle);
  resp.data = updated.vehicle;
  return resp;
}

export async function getVehicle(params, resp) {
  const { driverId } = params;
  const record = await findVehicleByUserId(driverId);
  if (!record) {
    resp.error = true;
    resp.error_message = 'Driver not found.';
    return resp;
  }
  resp.data = record.vehicle;
  return resp;
}

export async function patchVehicle(params, resp) {
  const { driverId, updates } = params;
  const updated = await patchVehicleFields(driverId, updates);
  if (!updated) {
    resp.error = true;
    resp.error_message = 'Failed to update vehicle.';
    return resp;
  }
  resp.data = updated.vehicle;
  return resp;
}
