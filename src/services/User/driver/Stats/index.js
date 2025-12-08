import {
  findStats,
  findLifeTimeHighlights,
  findWeeklyStats,
  findPayoutStats,
  findDailyStatsForWeek,
  findDrivingHours,
} from '../../../../dal/stats.js';
import { findDriverByUserId } from '../../../../dal/driver.js';
import { getDriverTodayEarnings } from '../../../../dal/stripe.js';
import RideModel from '../../../../models/Ride.js';

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
      resp.error_message = 'Failed to fetch weekly data';
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

export const getPayoutStats = async (
  user,
  { page = 1, limit = 10, fromDate, toDate },
  resp,
) => {
  try {
    const driver = await findDriverByUserId(user._id);
    if (!driver) {
      resp.error = true;
      resp.error_message = 'Failed to fetch driver';
      return resp;
    }

    const success = await findPayoutStats(driver._id, driver.createdAt, {
      page,
      limit,
      fromDate,
      toDate,
    });
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to fetch weekly data';
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
      resp.error_message = 'Failed to fetch weekly data';
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

export const fetchDriverBalance = async (user, resp) => {
  try {
    const driver = await findDriverByUserId(user._id);
    if (!driver) {
      resp.error = true;
      resp.error_message = 'Failed to fetch driver';
      return resp;
    }

    console.log('🔍 [fetchDriverBalance] User ID:', user._id);
    console.log('🔍 [fetchDriverBalance] Driver ID:', driver._id);
    console.log('🔍 [fetchDriverBalance] Driver ID Type:', typeof driver._id);

    // Get today's earnings from transactions (net earnings)
    const earnings = await getDriverTodayEarnings(driver._id);
    if (!earnings) {
      resp.error = true;
      resp.error_message = 'Failed to fetch driver balance';
      return resp;
    }

    // Get today's stats from rides (gross revenue) - same as /api/user/driver/statistic/?period=today
    const stats = await findStats(driver._id, { period: 'today' });

    // Get today's completed rides count
    const today = new Date();
    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    const todayRidesCount = await RideModel.countDocuments({
      driverId: driver._id,
      status: 'RIDE_COMPLETED',
      rideCompletedAt: {
        $gte: startOfDay,
        $lte: endOfDay,
      },
    });

    console.log('🔍 [fetchDriverBalance] Transaction earnings (net):', earnings);
    console.log('🔍 [fetchDriverBalance] Ride stats (gross):', stats);

    // Keep original response structure, add stats data directly
    resp.data = {
      balance: earnings.balance || 0, // Original balance field
      // Add today's stats directly
      grossRevenue: stats.totalRevenue || 0, // From rides (same as stats endpoint)
      completedRides: stats.completedRides || 0,
      totalRides: stats.totalRides || 0,
      cancelledRides: stats.cancelledRides || 0,
      cancellationRatio: stats.cancellationRatio || 0,
      averageRating: stats.averageRating || 0,
      period: 'today',
    };

    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'Something went wrong';
    return resp;
  }
};
