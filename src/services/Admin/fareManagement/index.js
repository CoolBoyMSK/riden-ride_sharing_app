import {
  createFareConfiguration,
  getFareConfigurations,
  getFareConfigurationById,
  updateFareByZoneNameAndCarType,
  deleteFareConfiguration,
  createDefaultFareConfiguration,
  getDefaultFareConfigurations,
  updateDefaultFareConfiguration,
  getCarTypes,
} from '../../../dal/fareManagement.js';

export async function addFare(body, resp) {
  try {
    const data = await createFareConfiguration(body);
    if (!data) {
      resp.error = true;
      resp.error_message = 'Failed to configure fare';
      return resp;
    }

    resp.data = data;
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
      resp.error_message = 'Failed to fetch fares';
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

export async function getAllFareById({ id }, resp) {
  try {
    const success = await getFareConfigurationById(id);
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to fetch fare';
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

export async function updateFare({ carType, zone, city }, body, resp) {
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

export async function addDefaultFare(body, resp) {
  try {
    const data = await createDefaultFareConfiguration(body);
    if (!data) {
      resp.error = true;
      resp.error_message = 'Failed to add default fare';
      return resp;
    }

    resp.data = data;
    return resp;
  } catch (error) {
    console.error('API ERROR: ', error);
    resp.error = true;
    resp.error_message = error.message || 'Something went wrong';
    return resp;
  }
}

export async function getDefaultFare(resp) {
  try {
    const data = await getDefaultFareConfigurations();
    if (!data) {
      resp.error = true;
      resp.error_message = 'Failed to fetch default fare';
      return resp;
    }

    resp.data = data;
    return resp;
  } catch (error) {
    console.error('API ERROR: ', error);
    resp.error = true;
    resp.error_message = error.message || 'Something went wrong';
    return resp;
  }
}

export async function updateDefaultFare(body, resp) {
  try {
    const data = await updateDefaultFareConfiguration(body);
    if (!data) {
      resp.error = true;
      resp.error_message = 'Failed to update default fare';
      return resp;
    }

    resp.data = data;
    return resp;
  } catch (error) {
    console.error('API ERROR: ', error);
    resp.error = true;
    resp.error_message = error.message || 'Something went wrong';
    return resp;
  }
}

export function fetchCarTypes(resp) {
  try {
    const data = getCarTypes();
    if (!data) {
      resp.error = true;
      resp.error_message = 'Failed to fetch car types';
      return resp;
    }

    resp.data = data;
    return resp;
  } catch (error) {
    console.error('API ERROR: ', error);
    resp.error = true;
    resp.error_message = error.message || 'Something went wrong';
    return resp;
  }
}
