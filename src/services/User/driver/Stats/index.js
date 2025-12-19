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
import RideTransaction from '../../../../models/RideTransaction.js';

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

    // Get today's stats from rides
    const stats = await findStats(driver._id, { period: 'today' });

    // Get today's completed rides count
    const today = new Date();
    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    // Get today's completed rides to calculate totalEarning (after commission)
    // Use requestedAt to match the same logic as findStats function
    const todayCompletedRides = await RideModel.find({
      driverId: driver._id,
      status: 'RIDE_COMPLETED',
      requestedAt: {
        $gte: startOfDay,
        $lte: endOfDay,
      },
    }).select('_id requestedAt rideCompletedAt').lean();

    const todayRideIds = todayCompletedRides.map((ride) => ride._id);
    console.log('🔍 [fetchDriverBalance] Today completed rides count:', todayCompletedRides.length);
    console.log('🔍 [fetchDriverBalance] Today ride IDs:', todayRideIds);

    // Calculate totalEarning from RideTransaction (driverEarning = after commission)
    // If RideTransaction doesn't exist, calculate from Ride model directly
    let totalEarning = 0;
    if (todayRideIds.length > 0) {
      // First, try to get from RideTransaction
      const earningResult = await RideTransaction.aggregate([
        {
          $match: {
            driverId: driver._id,
            rideId: { $in: todayRideIds },
            status: 'COMPLETED',
            isRefunded: false,
          },
        },
        {
          $group: {
            _id: null,
            totalEarning: {
              $sum: {
                $add: [
                  { $ifNull: ['$driverEarning', 0] },
                  { $ifNull: ['$tip', 0] }, // Include tips in driver earnings
                ],
              },
            },
          },
        },
      ]);

      console.log('🔍 [fetchDriverBalance] RideTransaction aggregation result:', earningResult);
      
      if (earningResult.length > 0 && earningResult[0].totalEarning > 0) {
        // Use RideTransaction data if available
        totalEarning = earningResult[0].totalEarning;
      } else {
        // If RideTransaction doesn't exist, calculate from Ride model
        // Commission is 20%, so driver gets 80% of actualFare + tips
        console.log('⚠️ [fetchDriverBalance] RideTransaction not found, calculating from Ride model');
        
        const rideEarningResult = await RideModel.aggregate([
          {
            $match: {
              _id: { $in: todayRideIds },
              driverId: driver._id,
              status: 'RIDE_COMPLETED',
            },
          },
          {
            $group: {
              _id: null,
              totalEarning: {
                $sum: {
                  $add: [
                    {
                      // Driver gets 80% of actualFare (after 20% commission)
                      $multiply: [
                        { $ifNull: ['$actualFare', 0] },
                        0.8,
                      ],
                    },
                    { $ifNull: ['$tipBreakdown.amount', 0] }, // Include tips
                  ],
                },
              },
            },
          },
        ]);

        console.log('🔍 [fetchDriverBalance] Ride model aggregation result:', rideEarningResult);
        totalEarning =
          rideEarningResult.length > 0 ? rideEarningResult[0].totalEarning : 0;
      }
    }

    console.log('🔍 [fetchDriverBalance] Transaction earnings (net):', earnings);
    console.log('🔍 [fetchDriverBalance] Ride stats (gross):', {
      balance: earnings.balance || 0, // Original balance field
      // Add today's stats directly
      totalEarning: totalEarning || 0, // Driver earnings after commission deduction
      completedRides: stats.completedRides || 0,
      totalRides: stats.totalRides || 0,
      cancelledRides: stats.cancelledRides || 0,
      cancellationRatio: stats.cancellationRatio || 0,
      averageRating: stats.averageRating || 0,
      period: 'today',
    });
    console.log('🔍 [fetchDriverBalance] Total Earning (after commission):', totalEarning);

    // Keep original response structure, add stats data directly
    resp.data = {
      balance: earnings.balance || 0, // Original balance field
      // Add today's stats directly
      totalEarning: totalEarning || 0, // Driver earnings after commission deduction
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
