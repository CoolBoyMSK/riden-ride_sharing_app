import {
  countPassengers,
  findPassengers,
  updatePassengerBlockStatus,
  findPassenger,
  deletePassenger,
  findPassengerDetails,
} from '../../../dal/passenger.js';
import {
  countPassengerBookings,
  findAllBookingsByPassengerId,
  countCanceledBookingsByPassengerId,
  countCompletedBookingsByPassengerId,
} from '../../../dal/booking.js';
import { extractDate } from '../../../utils/ride.js';

export const getAllPassengers = async (
  { page, limit, fromDate, toDate, search },
  resp,
) => {
  try {
    let filter = {};

    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter['userId.name'] = { $regex: escaped, $options: 'i' };
    }
    
    if (fromDate && toDate) {
      const start = extractDate(fromDate);
      const end = extractDate(toDate);
      if (!start || !end) {
        resp.error = true;
        resp.error_message = 'Invalid date format';
        return resp;
      }

      filter.createdAt = {
        $gte: new Date(start), // on or after start
        $lte: new Date(`${end}T23:59:59.999Z`), // on or before end
      };
    } else if (fromDate) {
      const start = extractDate(fromDate);
      if (!start) {
        resp.error = true;
        resp.error_message = 'Invalid fromDate format';
        return resp;
      }
      
      filter.createdAt = { $gte: new Date(start) };
    } else if (toDate) {
      const end = extractDate(toDate);
      if (!end) {
        resp.error = true;
        resp.error_message = 'Invalid toDate format';
        return resp;
      }
      
      filter.createdAt = { $lte: new Date(`${end}T23:59:59.999Z`) };
    }
    
    const totalItems = await countPassengers(filter);
    const items = await findPassengers(filter, { page, limit });
    if (!items) {
      resp.error = true;
      resp.error_message = 'Failed to find passengers';
      return resp;
    }

    const passengers = await Promise.all(
      items.map(async (passenger) => {
        const bookings = await countPassengerBookings(passenger._id);
        return {
          ...(passenger.toObject?.() || passenger),
          bookings: bookings || 0,
        };
      }),
    );

    resp.data = {
      passengers,
      page: page ? parseInt(page) : null,
      limit: limit ? parseInt(limit) : null,
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
    };
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = 'Something went wrong while fetching passengers';
    return resp;
  }
};

export const getPassengerById = async ({ passengerId }, resp) => {
  try {
    const passenger = await findPassengerDetails({ _id: passengerId });
    if (!passenger) {
      resp.error = true;
      resp.error_message = 'Passenger not found';
      return resp;
    }

    resp.data = {
      ...(passenger.toObject?.() || passenger),
      bookings: (await findAllBookingsByPassengerId(passengerId)) || null,
      totalbookings: (await countPassengerBookings(passengerId)) || 0,
      completedBookings:
        (await countCompletedBookingsByPassengerId(passengerId)) || 0,
      canceledBookings:
        (await countCanceledBookingsByPassengerId(passengerId)) || 0,
    };
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = 'Something went wrong while fetching passenger';
    return resp;
  }
};

export const deletePassengerById = async ({ passengerId }, resp) => {
  try {
    const passenger = await findPassenger({ _id: passengerId });
    if (!passenger) {
      resp.error = true;
      resp.error_message = 'Passenger not found';
      return resp;
    }

    const filter = { userId: passenger.userId, passengerId: passenger._id };
    const deleted = await deletePassenger(filter);

    if (!deleted) {
      resp.error = true;
      resp.error_message = 'Failed to delete Passenger';
      return resp;
    }

    resp.data = deleted;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = 'Something went wrong while deleting passenger';
    return resp;
  }
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

export const getUpdateRequests = async (resp) =>{
  try {
    
  } catch (error) {
    console.error(``)
  }
}