import {
  findStats,
  findLifeTimeHighlights,
  findWeeklyStats,
  findDailyStatsForWeek,
  findDrivingHours,
} from '../../../../dal/stats.js';
import { findDriverByUserId } from '../../../../dal/driver.js';
import RideModel from '../../../../models/Ride.js';
import mongoose from 'mongoose';

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
    // utils/weekCalculator.js
    const getWeekRange = (date = new Date()) => {
      const startOfWeek = new Date(date);
      const day = startOfWeek.getDay();
      const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1); // Monday as start
      startOfWeek.setDate(diff);
      startOfWeek.setHours(0, 0, 0, 0);

      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      endOfWeek.setHours(23, 59, 59, 999);

      const year = startOfWeek.getFullYear();
      const weekNumber = getWeekNumber(startOfWeek);

      return {
        weekStart: startOfWeek,
        weekEnd: endOfWeek,
        weekNumber,
        year,
        weekId: `week_${year}_${weekNumber.toString().padStart(2, '0')}`,
        display: `${formatDate(startOfWeek)} to ${formatDate(endOfWeek)}`,
      };
    };

    const getWeekNumber = (date) => {
      const startOfYear = new Date(date.getFullYear(), 0, 1);
      const days = Math.floor((date - startOfYear) / (24 * 60 * 60 * 1000));
      return Math.ceil((days + startOfYear.getDay() + 1) / 7);
    };

    const formatDate = (date) => {
      return date.toISOString().split('T')[0]; // YYYY-MM-DD
    };

    // services/statsService.js
    const findWeeklyStats = async (driverId) => {
      const currentWeek = getWeekRange();

      // Get all completed rides for the current week
      const weeklyRides = await RideModel.aggregate([
        {
          $match: {
            driverId: new mongoose.Types.ObjectId(driverId),
            status: 'RIDE_COMPLETED',
            createdAt: {
              $gte: currentWeek.weekStart,
              $lte: currentWeek.weekEnd,
            },
          },
        },
        {
          $lookup: {
            from: 'ridetransactions',
            localField: '_id',
            foreignField: 'rideId',
            as: 'transaction',
          },
        },
        {
          $unwind: {
            path: '$transaction',
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $project: {
            rideId: '$_id',
            date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            fare: { $ifNull: ['$actualFare', 0] },
            tip: { $ifNull: ['$tipBreakdown.amount', 0] },
            commission: { $ifNull: ['$transaction.commission', 0] },
            driverEarning: { $ifNull: ['$transaction.driverEarning', 0] },
            paymentStatus: '$paymentStatus',
            isRefunded: { $ifNull: ['$transaction.isRefunded', false] },
          },
        },
        {
          $group: {
            _id: null,
            totalRides: { $sum: 1 },
            totalFares: { $sum: '$fare' },
            totalTips: { $sum: '$tip' },
            totalCommission: { $sum: '$commission' },
            totalDriverEarnings: { $sum: '$driverEarning' },
            completedRides: {
              $sum: {
                $cond: [{ $eq: ['$paymentStatus', 'COMPLETED'] }, 1, 0],
              },
            },
            pendingRides: {
              $sum: {
                $cond: [{ $ne: ['$paymentStatus', 'COMPLETED'] }, 1, 0],
              },
            },
            refundedRides: {
              $sum: {
                $cond: ['$isRefunded', 1, 0],
              },
            },
            rideIds: { $push: '$rideId' },
          },
        },
      ]);

      const stats = weeklyRides[0] || {
        totalRides: 0,
        totalFares: 0,
        totalTips: 0,
        totalCommission: 0,
        totalDriverEarnings: 0,
        completedRides: 0,
        pendingRides: 0,
        refundedRides: 0,
        rideIds: [],
      };

      // Check if all rides are paid
      const allRidesPaid =
        stats.totalRides > 0 && stats.completedRides === stats.totalRides;
      const paymentStatus = allRidesPaid
        ? 'PAID'
        : stats.completedRides > 0
          ? 'PARTIAL'
          : 'PENDING';

      return {
        weekInfo: {
          weekNumber: currentWeek.weekNumber,
          year: currentWeek.year,
          weekId: currentWeek.weekId,
          startDate: currentWeek.weekStart,
          endDate: currentWeek.weekEnd,
          display: currentWeek.display,
        },
        earnings: {
          totalFares: stats.totalFares,
          totalTips: stats.totalTips,
          totalCommission: stats.totalCommission,
          totalDriverEarnings: stats.totalDriverEarnings,
          netEarnings: stats.totalDriverEarnings, // After commission deduction
        },
        rides: {
          total: stats.totalRides,
          completed: stats.completedRides,
          pending: stats.pendingRides,
          refunded: stats.refundedRides,
        },
        paymentStatus: {
          status: paymentStatus,
          isFullyPaid: allRidesPaid,
          paidRides: stats.completedRides,
          totalRides: stats.totalRides,
        },
        summary: {
          averageEarningPerRide:
            stats.totalRides > 0
              ? stats.totalDriverEarnings / stats.totalRides
              : 0,
          tipPercentage:
            stats.totalFares > 0
              ? (stats.totalTips / stats.totalFares) * 100
              : 0,
          commissionRate:
            stats.totalFares > 0
              ? (stats.totalCommission / stats.totalFares) * 100
              : 0,
        },
      };
    };

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

export const getDailyStatsForWeek = async (user, { year, week }, resp) => {
  try {
    const driver = await findDriverByUserId(user._id);
    if (!driver) {
      resp.error = true;
      resp.error_message = 'Failed to fetch driver';
      return resp;
    }

    const findDailyStatsForWeek = async (driverId, year, week) => {
      // Calculate date range for the specified week
      const weekStart = getDateFromWeek(year, week);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);

      // Get daily breakdown of rides for the week
      const dailyStats = await RideModel.aggregate([
        {
          $match: {
            driverId: new mongoose.Types.ObjectId(driverId),
            status: 'RIDE_COMPLETED',
            createdAt: {
              $gte: weekStart,
              $lte: weekEnd,
            },
          },
        },
        {
          $lookup: {
            from: 'ridetransactions',
            localField: '_id',
            foreignField: 'rideId',
            as: 'transaction',
          },
        },
        {
          $unwind: {
            path: '$transaction',
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $project: {
            rideId: '$_id',
            date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            dayOfWeek: { $dayOfWeek: '$createdAt' },
            fare: { $ifNull: ['$actualFare', 0] },
            tip: { $ifNull: ['$tipBreakdown.amount', 0] },
            commission: { $ifNull: ['$transaction.commission', 0] },
            discount: { $ifNull: ['$transaction.discount', 0] },
            driverEarning: { $ifNull: ['$transaction.driverEarning', 0] },
            paymentMethod: '$paymentMethod',
            paymentStatus: '$paymentStatus',
            isRefunded: { $ifNull: ['$transaction.isRefunded', false] },
            rideDuration: { $ifNull: ['$rideDuration', 0] },
            distance: { $ifNull: ['$distance', 0] },
          },
        },
        {
          $group: {
            _id: '$date',
            date: { $first: '$date' },
            dayOfWeek: { $first: '$dayOfWeek' },
            totalRides: { $sum: 1 },
            totalFares: { $sum: '$fare' },
            totalTips: { $sum: '$tip' },
            totalCommission: { $sum: '$commission' },
            totalDiscounts: { $sum: '$discount' },
            totalDriverEarnings: { $sum: '$driverEarning' },
            totalDistance: { $sum: '$distance' },
            totalRideTime: { $sum: '$rideDuration' },
            completedRides: {
              $sum: {
                $cond: [{ $eq: ['$paymentStatus', 'COMPLETED'] }, 1, 0],
              },
            },
            pendingRides: {
              $sum: {
                $cond: [{ $ne: ['$paymentStatus', 'COMPLETED'] }, 1, 0],
              },
            },
            refundedRides: {
              $sum: {
                $cond: ['$isRefunded', 1, 0],
              },
            },
            rides: {
              $push: {
                rideId: '$rideId',
                fare: '$fare',
                tip: '$tip',
                commission: '$commission',
                driverEarning: '$driverEarning',
                paymentMethod: '$paymentMethod',
                paymentStatus: '$paymentStatus',
                isRefunded: '$isRefunded',
                distance: '$distance',
                rideDuration: '$rideDuration',
              },
            },
          },
        },
        {
          $sort: { date: 1 },
        },
        {
          $project: {
            _id: 0,
            date: 1,
            dayOfWeek: 1,
            dayName: {
              $switch: {
                branches: [
                  { case: { $eq: ['$dayOfWeek', 1] }, then: 'Sunday' },
                  { case: { $eq: ['$dayOfWeek', 2] }, then: 'Monday' },
                  { case: { $eq: ['$dayOfWeek', 3] }, then: 'Tuesday' },
                  { case: { $eq: ['$dayOfWeek', 4] }, then: 'Wednesday' },
                  { case: { $eq: ['$dayOfWeek', 5] }, then: 'Thursday' },
                  { case: { $eq: ['$dayOfWeek', 6] }, then: 'Friday' },
                  { case: { $eq: ['$dayOfWeek', 7] }, then: 'Saturday' },
                ],
                default: 'Unknown',
              },
            },
            summary: {
              totalRides: '$totalRides',
              totalFares: '$totalFares',
              totalTips: '$totalTips',
              totalCommission: '$totalCommission',
              totalDiscounts: '$totalDiscounts',
              totalDriverEarnings: '$totalDriverEarnings',
              totalDistance: '$totalDistance',
              totalRideTime: '$totalRideTime',
              completedRides: '$completedRides',
              pendingRides: '$pendingRides',
              refundedRides: '$refundedRides',
            },
            metrics: {
              averageFare: {
                $cond: [
                  { $eq: ['$totalRides', 0] },
                  0,
                  { $divide: ['$totalFares', '$totalRides'] },
                ],
              },
              averageTip: {
                $cond: [
                  { $eq: ['$totalRides', 0] },
                  0,
                  { $divide: ['$totalTips', '$totalRides'] },
                ],
              },
              averageEarning: {
                $cond: [
                  { $eq: ['$totalRides', 0] },
                  0,
                  { $divide: ['$totalDriverEarnings', '$totalRides'] },
                ],
              },
              completionRate: {
                $cond: [
                  { $eq: ['$totalRides', 0] },
                  0,
                  { $divide: ['$completedRides', '$totalRides'] },
                ],
              },
              tipRate: {
                $cond: [
                  { $eq: ['$totalFares', 0] },
                  0,
                  { $divide: ['$totalTips', '$totalFares'] },
                ],
              },
            },
            rides: '$rides',
          },
        },
      ]);

      // Fill in missing days with zero values
      const allDays = [];
      for (let i = 0; i < 7; i++) {
        const date = new Date(weekStart);
        date.setDate(weekStart.getDate() + i);
        const dateStr = date.toISOString().split('T')[0];

        const existingDay = dailyStats.find((day) => day.date === dateStr);

        if (existingDay) {
          allDays.push(existingDay);
        } else {
          allDays.push({
            date: dateStr,
            dayOfWeek: date.getDay() + 1,
            dayName: [
              'Sunday',
              'Monday',
              'Tuesday',
              'Wednesday',
              'Thursday',
              'Friday',
              'Saturday',
            ][date.getDay()],
            summary: {
              totalRides: 0,
              totalFares: 0,
              totalTips: 0,
              totalCommission: 0,
              totalDiscounts: 0,
              totalDriverEarnings: 0,
              totalDistance: 0,
              totalRideTime: 0,
              completedRides: 0,
              pendingRides: 0,
              refundedRides: 0,
            },
            metrics: {
              averageFare: 0,
              averageTip: 0,
              averageEarning: 0,
              completionRate: 0,
              tipRate: 0,
            },
            rides: [],
          });
        }
      }

      return {
        weekInfo: {
          year,
          week,
          startDate: weekStart,
          endDate: weekEnd,
          display: `${formatDate(weekStart)} to ${formatDate(weekEnd)}`,
        },
        dailyStats: allDays,
        weeklySummary: calculateWeeklySummary(allDays),
      };
    };gi
    const formatDate = (date) => {
      return date.toISOString().split('T')[0]; // YYYY-MM-DD
    };
    // Helper function to get date from week number
    const getDateFromWeek = (year, week) => {
      const date = new Date(year, 0, 1 + (week - 1) * 7);
      const day = date.getDay();
      const diff = date.getDate() - day + (day === 0 ? -6 : 1);
      date.setDate(diff);
      date.setHours(0, 0, 0, 0);
      return date;
    };

    // Calculate weekly summary from daily stats
    const calculateWeeklySummary = (dailyStats) => {
      const summary = dailyStats.reduce(
        (acc, day) => ({
          totalRides: acc.totalRides + day.summary.totalRides,
          totalFares: acc.totalFares + day.summary.totalFares,
          totalTips: acc.totalTips + day.summary.totalTips,
          totalCommission: acc.totalCommission + day.summary.totalCommission,
          totalDiscounts: acc.totalDiscounts + day.summary.totalDiscounts,
          totalDriverEarnings:
            acc.totalDriverEarnings + day.summary.totalDriverEarnings,
          totalDistance: acc.totalDistance + day.summary.totalDistance,
          totalRideTime: acc.totalRideTime + day.summary.totalRideTime,
          completedRides: acc.completedRides + day.summary.completedRides,
          pendingRides: acc.pendingRides + day.summary.pendingRides,
          refundedRides: acc.refundedRides + day.summary.refundedRides,
        }),
        {
          totalRides: 0,
          totalFares: 0,
          totalTips: 0,
          totalCommission: 0,
          totalDiscounts: 0,
          totalDriverEarnings: 0,
          totalDistance: 0,
          totalRideTime: 0,
          completedRides: 0,
          pendingRides: 0,
          refundedRides: 0,
        },
      );

      return {
        ...summary,
        metrics: {
          averageFare:
            summary.totalRides > 0
              ? summary.totalFares / summary.totalRides
              : 0,
          averageTip:
            summary.totalRides > 0 ? summary.totalTips / summary.totalRides : 0,
          averageEarning:
            summary.totalRides > 0
              ? summary.totalDriverEarnings / summary.totalRides
              : 0,
          completionRate:
            summary.totalRides > 0
              ? summary.completedRides / summary.totalRides
              : 0,
          tipRate:
            summary.totalFares > 0 ? summary.totalTips / summary.totalFares : 0,
          averageDistance:
            summary.totalRides > 0
              ? summary.totalDistance / summary.totalRides
              : 0,
          averageRideTime:
            summary.totalRides > 0
              ? summary.totalRideTime / summary.totalRides
              : 0,
        },
      };
    };

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
