import {
  createZone,
  getAllZones,
  getZoneById,
  updateZone,
  deleteZone,
  getZoneTypes,
  updateParkingQueueAirport as updateParkingQueueAirportDAL,
  getAllParkingQueues,
} from '../../../dal/zone.js';

export const addZone = async (body, resp) => {
  try {
    const success = await createZone(body);
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to create new zone';
      return resp;
    }

    resp.data = success;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'Something went wrong';
    return resp;
  }
};

export const fetchAllZones = async (
  { isActive, page = 1, limit = 10 },
  resp,
) => {
  try {
    const success = await getAllZones({ isActive }, { page, limit });
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to fetch zones';
      return resp;
    }

    resp.data = success;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'Something went wrong';
    return resp;
  }
};

export const fetchZoneById = async ({ id }, resp) => {
  try {
    const success = await getZoneById(id);
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to fetch zone';
      return resp;
    }

    resp.data = success;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'Something went wrong';
    return resp;
  }
};

export const editZone = async ({ id }, body, resp) => {
  try {
    const success = await updateZone(id, body);
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to update zone';
      return resp;
    }

    resp.data = success;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'Something went wrong';
    return resp;
  }
};

export const removeZone = async ({ id }, resp) => {
  try {
    const success = await deleteZone(id);
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to delete zone';
      return resp;
    }

    resp.data = success;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'Something went wrong';
    return resp;
  }
};

export const fetchZoneTypes = (resp) => {
  try {
    const success = getZoneTypes();
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to fetch zone types';
      return resp;
    }

    resp.data = success;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'Something went wrong';
    return resp;
  }
};

export const updateParkingQueueAirport = async ({ parkingQueueId, airportId }, resp) => {
  try {
    const success = await updateParkingQueueAirportDAL(parkingQueueId, airportId);
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to update parking queue airport link';
      return resp;
    }

    resp.data = success;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'Something went wrong';
    return resp;
  }
};

export const fetchAllParkingQueues = async (
  { isActive, page = 1, limit = 10 },
  resp,
) => {
  try {
    const success = await getAllParkingQueues({ isActive }, { page, limit });
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to fetch parking queues';
      return resp;
    }

    resp.data = success;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'Something went wrong';
    return resp;
  }
};
