import {
  countPassengers,
  findPassengers,
  updatePassengerBlockStatus,
} from '../../../dal/passenger.js';

export const getAllPassengers = async ({ page, limit }, resp) => {
  const totalItems = await countPassengers();
  const items = await findPassengers({ page, limit });

  resp.data = {
    items,
    page,
    limit,
    totalItems,
    totalPages: Math.ceil(totalItems / limit),
  };
  return resp;
};

export const blockPassenger = async (passengerId, resp) => {
  const updated = await updatePassengerBlockStatus(passengerId, true);
  if (!updated) {
    resp.error = true;
    resp.error_message = 'Passenger not found';
    return resp;
  }
  resp.data = { id: updated._id, isBlocked: updated.isBlocked };
  return resp;
};

export const unblockPassenger = async (passengerId, resp) => {
  const updated = await updatePassengerBlockStatus(passengerId, false);
  if (!updated) {
    resp.error = true;
    resp.error_message = 'Passenger not found';
    return resp;
  }
  resp.data = { id: updated._id, isBlocked: updated.isBlocked };
  return resp;
};
