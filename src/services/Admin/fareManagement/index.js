import {
  getFareByCarType,
  createFareManagement as dalCreate,
  getAllFareManagements as dalGetAll,
  updateFareManagement as dalUpdate,
  updateDailyFare as dalUpdateDay,
  deleteFareManagement as dalDelete,
} from '../../../dal/fareManagement.js';

export async function createFareManagement(params, resp) {
  const { carType, dailyFares } = params;
  const exists = await getFareByCarType(carType);
  if (exists) {
    resp.error = true;
    resp.error_message = 'Fare settings for this car type already exist.';
    return resp;
  }
  const data = await dalCreate(carType, dailyFares);
  resp.data = data;
  return resp;
}

export async function getAllFareManagements(_params, resp) {
  const data = await dalGetAll();
  resp.data = data;
  return resp;
}

export async function getFareByCar(params, resp) {
  const { carType } = params;
  const data = await getFareByCarType(carType);
  if (!data) {
    resp.error = true;
    resp.error_message = 'Fare settings not found.';
    return resp;
  }
  resp.data = data;
  return resp;
}

export async function updateFareManagement(params, resp) {
  const { carType, dailyFares } = params;
  const data = await dalUpdate(carType, dailyFares);
  if (!data) {
    resp.error = true;
    resp.error_message = 'Failed to update fare settings.';
    return resp;
  }
  resp.data = data;
  return resp;
}

export async function updateDailyFare(params, resp) {
  const { carType, day, partialDailyFare } = params;
  const data = await dalUpdateDay(carType, day, partialDailyFare);
  if (!data) {
    resp.error = true;
    resp.error_message = 'Failed to update daily fare.';
    return resp;
  }
  resp.data = data;
  return resp;
}

export async function deleteFareManagement(params, resp) {
  const { carType } = params;
  const result = await dalDelete(carType);
  if (result.deletedCount === 0) {
    resp.error = true;
    resp.error_message = 'No fare settings found to delete.';
    return resp;
  }
  resp.data = { deleted: true };
  return resp;
}
