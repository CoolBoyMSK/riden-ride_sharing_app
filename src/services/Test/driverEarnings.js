import { findUserByEmail } from '../../dal/user/index.js';
import { findDriverByUserId } from '../../dal/driver.js';
import { getDriverTodayEarnings } from '../../dal/stripe.js';
import { findStats } from '../../dal/stats.js';
import RideModel from '../../models/Ride.js';

export const getDriverEarningsByEmail = async ({ email }, resp) => {
  try {
    console.log('[getDriverEarningsByEmail] Request received for email:', email);

    if (!email) {
      resp.error = true;
      resp.error_message = 'Email is required';
      return resp;
    }

    // Find user by email
    const user = await findUserByEmail(email);
    console.log('[getDriverEarningsByEmail] User found:', user ? 'Yes' : 'No');

    if (!user) {
      resp.error = true;
      resp.error_message = 'User not found with this email';
      return resp;
    }

    // Check if user is a driver
    if (!user.roles || !user.roles.includes('driver')) {
      resp.error = true;
      resp.error_message = 'User is not a driver';
      return resp;
    }

    // Find driver by userId
    const driver = await findDriverByUserId(user._id);
    console.log('[getDriverEarningsByEmail] Driver found:', driver ? 'Yes' : 'No');

    if (!driver) {
      resp.error = true;
      resp.error_message = 'Driver profile not found';
      return resp;
    }

    // Get today's earnings from transactions (net earnings)
    console.log('[getDriverEarningsByEmail] Getting today earnings from transactions for driverId:', driver._id);
    const earnings = await getDriverTodayEarnings(driver._id);

    // Get today's stats from rides (gross revenue) - same as /api/user/driver/statistic/?period=today
    console.log('[getDriverEarningsByEmail] Getting today stats from rides for driverId:', driver._id);
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

    console.log('[getDriverEarningsByEmail] Transaction earnings (net):', earnings);
    console.log('[getDriverEarningsByEmail] Ride stats (gross):', stats);
    console.log('[getDriverEarningsByEmail] Today rides count:', todayRidesCount);

    resp.data = {
      driver: {
        _id: driver._id,
        uniqueId: driver.uniqueId,
        userId: user._id,
        name: user.name,
        email: user.email,
        phoneNumber: user.phoneNumber,
      },
      todayEarnings: {
        // Net earnings from transactions (what driver actually received)
        netEarnings: earnings.balance || 0,
        // Gross revenue from rides (same as stats endpoint)
        grossRevenue: stats.totalRevenue || 0,
        currency: 'CAD',
        date: new Date().toISOString().split('T')[0], // Today's date in YYYY-MM-DD format
        completedRides: stats.completedRides || 0,
        totalRides: stats.totalRides || 0,
        cancelledRides: stats.cancelledRides || 0,
        cancellationRatio: stats.cancellationRatio || 0,
        averageRating: stats.averageRating || 0,
      },
      // Include full stats for reference
      stats: {
        ...stats,
        period: 'today',
      },
    };

    return resp;
  } catch (error) {
    console.error('[getDriverEarningsByEmail] ERROR:', error);
    resp.error = true;
    resp.error_message = error.message || 'Something went wrong';
    return resp;
  }
};

