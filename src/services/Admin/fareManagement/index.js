import {
  // getFareByCarType,
  createFareConfiguration,
  getFareConfigurations,
  updateFareByZoneNameAndCarType,
  deleteFareConfiguration,
} from '../../../dal/fareManagement.js';

export async function addFare(body, resp) {
  try {
    const success = await createFareConfiguration(body);
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to configure fare';
      return resp;
    }

    resp.data = success;
    return resp;
  } catch (error) {
    console.error('API ERROR: ', error);
    resp.error = true;
    resp.error_message = error.message || 'Something went wrong';
    return resp;
  }
}

export async function getAllFares(
  { city, carType, page = 1, limit = 10 },
  resp,
) {
  try {
    const success = await getFareConfigurations(
      { city, cartype: carType },
      { page: parseInt(page), limit: parseInt(limit) },
    );
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to configure fare';
      return resp;
    }

    resp.data = success;
    return resp;
  } catch (error) {
    console.error('API ERROR: ', error);
    resp.error = true;
    resp.error_message = error.message || 'Something went wrong';
    return resp;
  }
}

export async function updateFare({ carType }, { zone, city }, body, resp) {
  try {
    const success = await updateFareByZoneNameAndCarType(
      zone,
      city,
      carType,
      body,
    );
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to update fare.';
      return resp;
    }

    resp.data = success;
    return resp;
  } catch (error) {
    console.error('API ERROR: ', error);
    resp.error = true;
    resp.error_message = error.message || 'Something went wrong';
    return resp;
  }
}

export async function deleteFare({ id }, resp) {
  try {
    const success = await deleteFareConfiguration(id);
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to configure fare';
      return resp;
    }

    resp.data = success;
    return resp;
  } catch (error) {
    console.error('API ERROR: ', error);
    resp.error = true;
    resp.error_message = error.message || 'Something went wrong';
    return resp;
  }
}
