import {
  addDriverSuspension,
  countDrivers,
  findDrivers,
  removeDriverBlock,
} from '../../../dal/driver.js';

export const getAllDrivers = async ({ page, limit }, resp) => {
  const totalItems = await countDrivers();
  const items = await findDrivers({ page, limit });

  resp.data = {
    items,
    page,
    limit,
    totalItems,
    totalPages: Math.ceil(totalItems / limit),
  };
  return resp;
};

export const suspendDriver = async (driverId, reason, endDate, resp) => {
  const updated = await addDriverSuspension(driverId, reason, endDate);
  if (!updated) {
    resp.error = true;
    resp.error_message = 'Driver not found';
    return resp;
  }
  resp.data = {
    id: updated._id,
    isBlocked: updated.isBlocked,
    suspension: updated.suspensions.slice(-1)[0],
  };
  return resp;
};

export const unsuspendDriver = async (driverId, resp) => {
  const updated = await removeDriverBlock(driverId);
  if (!updated) {
    resp.error = true;
    resp.error_message = 'Driver not found';
    return resp;
  }
  resp.data = { id: updated._id, isBlocked: updated.isBlocked };
  return resp;
};
