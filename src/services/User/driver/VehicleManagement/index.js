import mongoose from 'mongoose';
import {
  findVehicleByUserId,
  upsertVehicle as dalUpsertVehicle,
  vehicleUpdateRequest,
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

export async function updateDriverVehicleRequest(userId, vehicle, resp) {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const updated = await vehicleUpdateRequest(userId, vehicle, session);
    if (!updated) {
      await session.abortTransaction();
      session.endSession();

      resp.error = true;
      resp.error_message = 'Failed to update vehicle.';
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
    resp.error_message = 'Something went wrong while sending update request.';
    return resp;
  }
}
