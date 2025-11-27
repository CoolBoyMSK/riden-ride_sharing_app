import Ride from '../models/Ride.js';
import Driver from '../models/Driver.js';
import RideModel from '../models/Ride.js';
import DriverPayout from '../models/DriverPayout.js';
import Feedback from '../models/Feedback.js';
import mongoose from 'mongoose';

const formatDate = (date) => {
  return date.toISOString().split('T')[0]; // YYYY-MM-DD
};

const getDateFromWeek = (year, week) => {
  const date = new Date(year, 0, 1 + (week - 1) * 7);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
};

const getAllWeeksSinceDate = (startDate, endDate) => {
  const weeks = [];
  const current = new Date(startDate);
  const end = new Date(endDate);

  // Set to the start of the week (Monday)
  current.setDate(current.getDate() - current.getDay() + 1);

  while (current <= end) {
    const weekStart = new Date(current);
    const weekEnd = new Date(current);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    const weekNumber = getISOWeek(weekStart);
    const year = weekStart.getFullYear();

    weeks.push({
      weekNumber,
      year,
      weekId: `${year}-${weekNumber}`,
      weekStart: new Date(weekStart),
      weekEnd: new Date(weekEnd),
      display: `${formatDate(weekStart)} to ${formatDate(weekEnd)}`,
    });

    current.setDate(current.getDate() + 7);
  }

  return weeks;
};

const getISOWeek = (date) => {
  const target = new Date(date.valueOf());
  const dayNr = (date.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7));
  }
  return 1 + Math.ceil((firstThursday - target) / 604800000);
};

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

  // --- Cancellation ratio ---
  const cancellationRatio = totalRides > 0 ? cancelledRides / totalRides : 0;

  // --- Average rating (only approved feedbacks) ---
  const feedbackDateQuery = Object.keys(dateFilter).length
    ? { createdAt: dateFilter }
    : {};

  const ratingResult = await Feedback.aggregate([
    {
      $match: {
        driverId,
        type: 'by_passenger',
        isApproved: true,
        ...feedbackDateQuery,
      },
    },
    {
      $group: {
        _id: null,
        averageRating: { $avg: '$rating' },
        totalRatings: { $sum: 1 },
      },
    },
  ]);

  const averageRating =
    ratingResult.length > 0 && ratingResult[0].totalRatings > 0
      ? ratingResult[0].averageRating
      : 0;

  return {
    totalRides,
    completedRides,
    cancelledRides,
    totalRevenue,
    cancellationRatio,
    averageRating,
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

  return {
    totalRides,
    joinDate: driver.createdAt,
  };
};

export const findWeeklyStats = async (driverId) => {
  // Get driver creation date to determine historical range
  const driver = await Driver.findById(driverId).select('createdAt').lean();
  const driverCreatedAt = driver?.createdAt || new Date();

  // Get all weeks from driver creation to current week
  const allWeeks = getAllWeeksSinceDate(driverCreatedAt, new Date());

  // Get weekly stats for all weeks in a single query
  const weeklyStats = await Ride.aggregate([
    {
      $match: {
        driverId: new mongoose.Types.ObjectId(driverId),
        status: 'RIDE_COMPLETED',
        createdAt: { $gte: driverCreatedAt },
      },
    },
    {
      $lookup: {
        from: 'ridetransactions',
        let: { rideId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ['$rideId', '$$rideId'] },
              status: { $in: ['COMPLETED', 'REFUNDED'] },
            },
          },
        ],
        as: 'transactions',
      },
    },
    {
      $unwind: '$transactions',
    },
    {
      $addFields: {
        weekNumber: { $isoWeek: '$createdAt' },
        year: { $isoWeekYear: '$createdAt' },
      },
    },
    {
      $group: {
        _id: {
          year: '$year',
          week: '$weekNumber',
        },
        totalRides: {
          $sum: {
            $cond: [{ $eq: ['$transactions.status', 'COMPLETED'] }, 1, 0],
          },
        },
        totalCommission: {
          $sum: {
            $cond: [
              { $eq: ['$transactions.status', 'COMPLETED'] },
              '$transactions.commission',
              0,
            ],
          },
        },
        totalDriverEarnings: {
          $sum: {
            $cond: [
              { $eq: ['$transactions.status', 'COMPLETED'] },
              '$transactions.driverEarning',
              0,
            ],
          },
        },
      },
    },
  ]);

  // Get ALL payouts for the driver (not grouped by week)
  const allPayouts = await DriverPayout.find({
    driverId: new mongoose.Types.ObjectId(driverId),
  })
    .sort({ payoutDate: -1 })
    .lean();

  // Create maps for easy lookup
  const statsMap = new Map();
  weeklyStats.forEach((stat) => {
    const key = `${stat._id.year}-${stat._id.week}`;
    statsMap.set(key, stat);
  });

  // Create a map to find payout for each week
  const payoutsMap = new Map();
  allPayouts.forEach((payout) => {
    // Convert weekStart string (dd-mm-yyyy) to Date object to get week number
    const [day, month, year] = payout.weekStart.split('-');
    const weekStartDate = new Date(`${year}-${month}-${day}`);
    const weekNumber = getISOWeek(weekStartDate);
    const payoutYear = weekStartDate.getFullYear();

    const key = `${payoutYear}-${weekNumber}`;

    // Only set if not already set (to get the latest payout for each week)
    if (!payoutsMap.has(key)) {
      payoutsMap.set(key, payout);
    }
  });

  // Build response array for all weeks
  const weeklyData = allWeeks.map((week) => {
    const key = `${week.year}-${week.weekNumber}`;
    const stats = statsMap.get(key) || {
      totalRides: 0,
      totalCommission: 0,
      totalDriverEarnings: 0,
    };

    const payout = payoutsMap.get(key);

    // Determine status logic:
    // 1. If there's a payout with status 'paid', show 'PAID'
    // 2. If there are earnings but no payout, show 'PENDING'
    // 3. If no earnings and no payout, show 'NO_EARNINGS'
    let status = 'NO_EARNINGS';
    if (payout?.status === 'paid') {
      status = 'PAID';
    } else if (stats.totalDriverEarnings > 0) {
      status = 'PENDING';
    }

    return {
      weekInfo: {
        weekNumber: week.weekNumber,
        year: week.year,
        weekId: week.weekId,
        startDate: week.weekStart,
        endDate: week.weekEnd,
        display: week.display,
        status: status,
      },
      earnings: {
        payoutDate: payout?.payoutDate || null,
        totalDeductions: stats.totalCommission,
        totalEarnings: stats.totalDriverEarnings,
        total: stats.totalRides,
        // Include payout amount if available
        payoutAmount: payout?.totalPaid || 0,
      },
    };
  });

  return weeklyData;
};

export const findDailyStatsForWeek = async (driverId, year, week) => {
  // Calculate date range for the specified week
  const weekStart = getDateFromWeek(year, week);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  console.log(
    `📅 Week ${week} of ${year}: ${weekStart.toISOString()} to ${weekEnd.toISOString()}`,
  );

  // Get daily breakdown of rides for the week
  const dailyStats = await RideModel.aggregate([
    {
      $match: {
        driverId: new mongoose.Types.ObjectId(driverId),
        status: 'RIDE_COMPLETED',
        createdAt: { $gte: weekStart, $lte: weekEnd },
      },
    },
    {
      $lookup: {
        from: 'ridetransactions',
        localField: '_id',
        foreignField: 'rideId',
        as: 'transactions',
      },
    },
    {
      $unwind: {
        path: '$transactions',
        preserveNullAndEmptyArrays: true, // Handle rides without transactions
      },
    },
    {
      $match: {
        $or: [
          { 'transactions.status': { $in: ['COMPLETED', 'REFUNDED'] } },
          { transactions: { $exists: false } }, // Include rides without transactions
        ],
      },
    },
    {
      $group: {
        _id: '$_id', // Group by ride ID first to avoid duplicates
        rideId: { $first: '$_id' },
        createdAt: { $first: '$createdAt' },
        actualDistance: { $first: '$actualDistance' },
        actualFare: { $first: '$actualFare' },
        tipBreakdown: { $first: '$tipBreakdown' },
        transaction: { $first: '$transactions' },
      },
    },
    {
      $project: {
        rideId: 1,
        date: {
          $dateToString: {
            format: '%Y-%m-%d',
            date: '$createdAt',
            timezone: 'UTC', // Ensure consistent timezone
          },
        },
        dayOfWeek: {
          $dayOfWeek: {
            date: '$createdAt',
            timezone: 'UTC',
          },
        },
        distance: { $ifNull: ['$actualDistance', 0] },
        fare: { $ifNull: ['$actualFare', 0] },
        tip: { $ifNull: ['$tipBreakdown.amount', 0] },
        commission: { $ifNull: ['$transaction.commission', 0] },
        discount: { $ifNull: ['$transaction.discount', 0] },
        driverEarning: { $ifNull: ['$transaction.driverEarning', 0] },
        transactionStatus: { $ifNull: ['$transaction.status', 'COMPLETED'] },
      },
    },
    {
      $match: {
        transactionStatus: 'COMPLETED', // Only include completed transactions
      },
    },
    {
      $group: {
        _id: '$date',
        date: { $first: '$date' },
        dayOfWeek: { $first: '$dayOfWeek' },
        rides: {
          $push: {
            rideId: '$rideId',
            distance: '$distance',
            fare: '$fare',
            tip: '$tip',
            commission: '$commission',
            discount: '$discount',
            driverEarning: '$driverEarning',
          },
        },
        totalRides: { $sum: 1 },
        totalEarnings: { $sum: '$driverEarning' },
        totalDistance: { $sum: '$distance' },
      },
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
        rides: 1,
        totalRides: 1,
        totalEarnings: 1,
        totalDistance: 1,
      },
    },
    {
      $sort: { date: 1 },
    },
  ]);

  console.log(`📊 Found ${dailyStats.length} days with data`);

  // Fill in missing days with consistent structure
  const allDays = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + i);
    const dateStr = date.toISOString().split('T')[0];

    // MongoDB dayOfWeek: 1=Sunday, 2=Monday, ..., 7=Saturday
    const dayOfWeek = date.getUTCDay() + 1; // getUTCDay() returns 0=Sunday, 6=Saturday

    const dayNames = [
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
    ];
    const dayName = dayNames[date.getUTCDay()];

    const existingDay = dailyStats.find((day) => day.date === dateStr);

    allDays.push(
      existingDay || {
        date: dateStr,
        dayOfWeek: dayOfWeek,
        dayName: dayName,
        rides: [],
        totalRides: 0,
        totalEarnings: 0,
        totalDistance: 0,
      },
    );
  }

  // Debug: Log the final structure
  console.log('📋 FINAL DAILY STATS STRUCTURE:');
  allDays.forEach((day) => {
    console.log(
      `  ${day.date} (${day.dayName}): ${day.rides.length} rides, $${day.totalEarnings} earnings`,
    );
  });

  return {
    weekInfo: {
      year,
      week,
      startDate: weekStart,
      endDate: weekEnd,
      display: `${formatDate(weekStart)} to ${formatDate(weekEnd)}`,
    },
    dailyStats: allDays,
  };
};

export const findDrivingHours = async (driverId) => {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  // Fetch today's completed rides with proper time fields
  const rides = await RideModel.find({
    driverId,
    status: 'RIDE_COMPLETED',
    // Use actual ride start and end times, not assignment/payment times
    $or: [
      { rideStartedAt: { $gte: startOfDay, $lte: endOfDay } },
      { rideCompletedAt: { $gte: startOfDay, $lte: endOfDay } },
    ],
  }).select('rideStartedAt rideCompletedAt status driverAssignedAt');

  if (!rides.length) {
    return {
      success: true,
      totalHoursDriven: 0,
      remainingHours: 13,
      ridesCount: 0,
      message: 'No completed rides for today.',
    };
  }

  // Calculate total ACTUAL driving hours
  const totalHours = rides.reduce((acc, ride) => {
    // Use startedAt and completedAt for actual driving time
    if (ride.rideStartedAt && ride.rideCompletedAt) {
      const startTime = new Date(ride.rideStartedAt);
      const endTime = new Date(ride.rideCompletedAt);

      // Ensure valid time range and within today
      if (endTime > startTime) {
        const diffMs = endTime - startTime;
        const diffHours = diffMs / (1000 * 60 * 60);

        // Only count positive, reasonable driving times (less than 24 hours per ride)
        if (diffHours > 0 && diffHours < 24) {
          return acc + diffHours;
        }
      }
    }
    return acc;
  }, 0);

  const remainingHours = Math.max(13 - totalHours, 0);

  return {
    success: true,
    totalHoursDriven: Number(totalHours.toFixed(2)),
    remainingHours: Number(remainingHours.toFixed(2)),
    ridesCount: rides.length,
    dailyLimit: 13,
  };
};

export const findPayoutStats = async (
  driverId,
  driverCreatedAt,
  { page = 1, limit = 10, fromDate, toDate } = {},
) => {
  try {
    // Parse and constrain date filters
    let payoutDateFilter = {};
    let minStartDate = driverCreatedAt;
    let maxEndDate = new Date();

    if (fromDate) {
      minStartDate = new Date(fromDate);
      if (isNaN(minStartDate)) minStartDate = driverCreatedAt;
    }
    if (toDate) {
      maxEndDate = new Date(toDate);
      if (isNaN(maxEndDate)) maxEndDate = new Date();
      maxEndDate.setHours(23, 59, 59, 999);
    }

    payoutDateFilter.payoutDate = {
      $gte: minStartDate,
      $lte: maxEndDate,
    };

    // Build query
    const query = {
      driverId: new mongoose.Types.ObjectId(driverId),
      ...payoutDateFilter,
    };

    // Get total count
    const total = await DriverPayout.countDocuments(query);

    // Get payouts in paginated form
    const payouts = await DriverPayout.find(query)
      .sort({ payoutDate: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    return {
      data: payouts,
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      totalPages: Math.ceil(total / limit),
    };
  } catch (error) {
    throw error;
  }
};
