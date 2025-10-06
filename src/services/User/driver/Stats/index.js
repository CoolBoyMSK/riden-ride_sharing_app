import {
  findStats,
  findLifeTimeHighlights,
  findWeeklyStats,
  findDailyStatsForWeek,
  findDrivingHours,
} from '../../../../dal/stats.js';
import { findDriverByUserId } from '../../../../dal/driver.js';

export const getStats = async (user, { fromDate, toDate, period }, resp) => {
  try {
    const driver = await findDriverByUserId(user._id);
    if (!driver) {
      resp.error = true;
      resp.error_message = 'Failed to fetch driver';
      return resp;
    }

    const success = await findStats(driver._id, { fromDate, toDate, period });
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to fetch stats';
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

export const getLifeTimeHighlights = async (user, resp) => {
  try {
    const driver = await findDriverByUserId(user._id);
    if (!driver) {
      resp.error = true;
      resp.error_message = 'Failed to fetch driver';
      return resp;
    }

    const success = await findLifeTimeHighlights(driver._id);
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to fetch stats';
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

export const getWeeklyStats = async (user, resp) => {
  try {
    const driver = await findDriverByUserId(user._id);
    if (!driver) {
      resp.error = true;
      resp.error_message = 'Failed to fetch driver';
      return resp;
    }

    const success = await findWeeklyStats(driver._id);
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to fetch stats';
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

export const getDailyStatsForWeek = async (user, { year, week }, resp) => {
  try {
    const driver = await findDriverByUserId(user._id);
    if (!driver) {
      resp.error = true;
      resp.error_message = 'Failed to fetch driver';
      return resp;
    }

    const success = await findDailyStatsForWeek(driver._id, year, week);
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to fetch stats';
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

export const getDrivingHours = async (user, resp) => {
  try {
    const driver = await findDriverByUserId(user._id);
    if (!driver) {
      resp.error = true;
      resp.error_message = 'Failed to fetch driver';
      return resp;
    }

    const success = await findDrivingHours(driver._id);
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to fetch driving hours';
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
