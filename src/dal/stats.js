import Ride from '../models/Ride.js';
import Driver from '../models/Driver.js';
import mongoose from 'mongoose';
import { startOfISOWeek, endOfISOWeek, addWeeks, startOfYear } from 'date-fns';

export const findStats = async (id, options = {}) => {
  // Safe destructuring
  const { fromDate, toDate, period } = options;

  const driverId = new mongoose.Types.ObjectId(id);

  // --- Date range setup ---
  let dateFilter = {};
  const now = new Date();

  switch (period) {
    case 'today': {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      const end = new Date(now);
      end.setHours(23, 59, 59, 999);
      dateFilter = { $gte: start, $lte: end };
      break;
    }
    case 'yesterday': {
      const start = new Date(now);
      start.setDate(start.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      const end = new Date(now);
      end.setDate(end.getDate() - 1);
      end.setHours(23, 59, 59, 999);
      dateFilter = { $gte: start, $lte: end };
      break;
    }
    case 'last7Days': {
      const start = new Date(now);
      start.setDate(start.getDate() - 6); // include today
      start.setHours(0, 0, 0, 0);
      dateFilter = { $gte: start, $lte: now };
      break;
    }
    case 'lastMonth': {
      const start = new Date(now);
      start.setMonth(start.getMonth() - 1);
      start.setHours(0, 0, 0, 0);
      dateFilter = { $gte: start, $lte: now };
      break;
    }
    case 'last6Months': {
      const start = new Date(now);
      start.setMonth(start.getMonth() - 6);
      start.setHours(0, 0, 0, 0);
      dateFilter = { $gte: start, $lte: now };
      break;
    }
    case 'lastYear': {
      const start = new Date(now);
      start.setFullYear(start.getFullYear() - 1);
      start.setHours(0, 0, 0, 0);
      dateFilter = { $gte: start, $lte: now };
      break;
    }
    case 'custom': {
      const start = fromDate ? new Date(fromDate) : undefined;
      const end = toDate ? new Date(`${toDate}T23:59:59.999Z`) : undefined;

      if (start && end) dateFilter = { $gte: start, $lte: end };
      else if (start) dateFilter = { $gte: start };
      else if (end) dateFilter = { $lte: end };
      break;
    }
    default:
      dateFilter = {}; // lifetime
  }

  const dateQuery = Object.keys(dateFilter).length
    ? { requestedAt: dateFilter }
    : {};

  const baseFilter = { driverId, ...dateQuery };

  // --- Total rides ---
  const totalRides = await Ride.countDocuments({
    ...baseFilter,
    status: {
      $in: [
        'RIDE_COMPLETED',
        'CANCELLED_BY_PASSENGER',
        'CANCELLED_BY_DRIVER',
        'CANCELLED_BY_SYSTEM',
      ],
    },
  });

  // --- Completed rides ---
  const completedRides = await Ride.countDocuments({
    ...baseFilter,
    status: 'RIDE_COMPLETED',
  });

  // --- Cancelled rides ---
  const cancelledRides = await Ride.countDocuments({
    ...baseFilter,
    status: {
      $in: [
        'CANCELLED_BY_PASSENGER',
        'CANCELLED_BY_DRIVER',
        'CANCELLED_BY_SYSTEM',
      ],
    },
  });

  // --- Revenue ---
  const revenueResult = await Ride.aggregate([
    { $match: { driverId, status: 'RIDE_COMPLETED', ...dateQuery } },
    {
      $group: {
        _id: null,
        totalRevenue: {
          $sum: {
            $add: [
              { $ifNull: ['$actualFare', 0] },
              { $ifNull: ['$tipBreakdown.amount', 0] },
            ],
          },
        },
      },
    },
  ]);

  const totalRevenue =
    revenueResult.length > 0 ? revenueResult[0].totalRevenue : 0;

  return {
    totalRides,
    completedRides,
    cancelledRides,
    totalRevenue,
    period: period || 'lifetime',
    ...(fromDate || toDate ? { fromDate, toDate } : {}),
  };
};

export const findLifeTimeHighlights = async (driverId) => {
  if (!mongoose.Types.ObjectId.isValid(driverId)) {
    throw new Error('Invalid driver id');
  }

  const totalRides = await Ride.countDocuments({
    driverId: new mongoose.Types.ObjectId(driverId),
  });

  const driver = await Driver.findById(driverId).select('createdAt');
  if (!driver) {
    throw new Error('Driver not found');
  }

  const joinDate = driver.createdAt;
  const now = new Date();

  // Difference in years
  const yearsSinceJoined =
    now.getFullYear() -
    joinDate.getFullYear() -
    (now.getMonth() < joinDate.getMonth() ||
    (now.getMonth() === joinDate.getMonth() &&
      now.getDate() < joinDate.getDate())
      ? 1
      : 0);

  return {
    totalRides,
    yearsSinceJoined,
  };
};

export const findWeeklyStats = async (driverId) => {
  const matchStage = {
    driverId: new mongoose.Types.ObjectId(driverId),
    status: {
      $in: [
        'RIDE_COMPLETED',
        'CANCELLED_BY_PASSENGER',
        'CANCELLED_BY_DRIVER',
        'CANCELLED_BY_SYSTEM',
      ],
    },
  };

  const results = await Ride.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: {
          year: { $isoWeekYear: '$requestedAt' },
          week: { $isoWeek: '$requestedAt' },
        },
        totalRides: { $sum: 1 },
        completedRides: {
          $sum: { $cond: [{ $eq: ['$status', 'RIDE_COMPLETED'] }, 1, 0] },
        },
        cancelledRides: {
          $sum: {
            $cond: [
              {
                $in: [
                  '$status',
                  [
                    'CANCELLED_BY_PASSENGER',
                    'CANCELLED_BY_DRIVER',
                    'CANCELLED_BY_SYSTEM',
                  ],
                ],
              },
              1,
              0,
            ],
          },
        },
        totalRevenue: {
          $sum: {
            $add: [
              { $ifNull: ['$actualFare', 0] },
              { $ifNull: ['$tipBreakdown.amount', 0] },
            ],
          },
        },
        firstDate: { $min: '$requestedAt' }, // for calculating week start
      },
    },
    { $sort: { '_id.year': -1, '_id.week': -1 } },
  ]);

  return results.map((r) => {
    const weekStart = startOfISOWeek(new Date(r.firstDate)); // Monday
    const weekEnd = endOfISOWeek(new Date(r.firstDate)); // Sunday
    return {
      year: r._id.year,
      week: r._id.week,
      weekStart: weekStart.toISOString().split('T')[0],
      weekEnd: weekEnd.toISOString().split('T')[0],
      totalRides: r.totalRides,
      completedRides: r.completedRides,
      cancelledRides: r.cancelledRides,
      totalRevenue: r.totalRevenue,
    };
  });
};

export const findDailyStatsForWeek = async (driverId, year, week) => {
  // Calculate start of ISO year
  const yearStart = startOfYear(new Date(year, 0, 1));

  // Add weeks to get the Monday of the requested ISO week
  const weekStart = startOfISOWeek(addWeeks(yearStart, week - 1));
  const weekEnd = endOfISOWeek(weekStart);

  // Fetch rides within that week
  const rides = await Ride.find({
    driverId: new mongoose.Types.ObjectId(driverId),
    status: {
      $in: [
        'RIDE_COMPLETED',
        'CANCELLED_BY_PASSENGER',
        'CANCELLED_BY_DRIVER',
        'CANCELLED_BY_SYSTEM',
      ],
    },
    requestedAt: { $gte: weekStart, $lte: weekEnd },
  })
    .select('rideId actualDistance actualFare tipBreakdown requestedAt')
    .lean();

  // Prepare daily stats array (1=Monday → 7=Sunday)
  const dailyStats = Array.from({ length: 7 }, (_, i) => ({
    dayOfWeek: i + 1,
    rides: [],
    totalRides: 0,
    totalRevenue: 0,
  }));

  rides.forEach((ride) => {
    const dayIndex = new Date(ride.requestedAt).getDay(); // 0=Sunday → 6=Saturday
    const isoDay = dayIndex === 0 ? 7 : dayIndex; // Convert Sunday=0 → 7
    const revenue = (ride.actualFare || 0) + (ride.tipBreakdown?.amount || 0);

    dailyStats[isoDay - 1].rides.push({
      rideId: ride.rideId,
      actualDistance: ride.actualDistance,
      actualFare: ride.actualFare,
      tip: ride.tipBreakdown?.amount || 0,
      totalRevenue: revenue,
    });

    dailyStats[isoDay - 1].totalRides += 1;
    dailyStats[isoDay - 1].totalRevenue += revenue;
  });

  return dailyStats;
};
