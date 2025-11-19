import { getFareForLocation } from '../../../dal/fareManagement.js';
import {
  validatePromoCode,
  findActivePromoCodes,
} from '../../../dal/promo_code.js';

// Get current day of week
const getCurrentDay = () => {
  const days = [
    'sunday',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
  ];
  return days[new Date().getDay()];
};

// Check if current time is night time
const isNightTime = (nightTimeConfig, scheduledTime = null) => {
  const now = scheduledTime ? new Date(scheduledTime) : new Date();
  const currentTime = now.getHours() * 60 + now.getMinutes(); // minutes since midnight

  const [fromHour, fromMin] = nightTimeConfig.from.split(':').map(Number);
  const [toHour, toMin] = nightTimeConfig.to.split(':').map(Number);

  const fromTime = fromHour * 60 + fromMin;
  const toTime = toHour * 60 + toMin;

  // Handle overnight time ranges (e.g., 22:00 to 06:00)
  if (fromTime > toTime) {
    return currentTime >= fromTime || currentTime <= toTime;
  }

  return currentTime >= fromTime && currentTime <= toTime;
};

// Calculate estimated fare
export const calculateEstimatedFare = async (
  carType,
  distance,
  duration,
  promoCode = null,
  surgeMultiplier = 1,
  fareConfig,
  scheduledTime = null,
) => {
  try {
    if (!fareConfig) {
      throw new Error(`Fare configuration not found for car type: ${carType}`);
    }

    // Find the car type configuration within dailyFares
    const carTypeFare = fareConfig.dailyFares.find(
      (fare) => fare.carType === carType,
    );
    if (!carTypeFare) {
      throw new Error(`Fare configuration not found for ${carType} car type.`);
    }

    // Calculate base components (same calculations as before)
    const rideSetupFee = carTypeFare.rideSetupFee;
    const baseFare = carTypeFare.baseFare;
    const surgeAmount = baseFare * surgeMultiplier - baseFare;
    const distanceFare = distance * carTypeFare.perKmFare;
    const timeFare = duration ? duration * carTypeFare.perMinuteFare : 0;
    const nightCharge = isNightTime(carTypeFare.nightTime, scheduledTime)
      ? carTypeFare.nightCharge
      : 0;

    // Calculate subtotal (same calculation as before)
    const subtotal =
      rideSetupFee +
      baseFare * surgeMultiplier +
      distanceFare +
      timeFare +
      nightCharge;

    // Return the exact same structure as before
    return {
      success: true,
      fareBreakdown: {
        rideSetupFee,
        baseFare,
        distanceFare,
        timeFare,
        nightCharge,
        waitingCharge: 0,
        discount: 0, // Will be calculated during actual ride
        subtotal,
        promoDiscount: 0,
        surgeMultiplier,
        surgeAmount: surgeAmount > 0 ? surgeAmount : 0,
        finalAmount: subtotal,
      },
      fareConfig: carTypeFare,
      estimatedFare: subtotal,
      promoDetails: null,
      currency: 'CAD',
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
};

export const calculateActualFare = async (rideData) => {
  try {
    const {
      carType,
      actualDistance,
      actualDuration,
      waitingTime = 0,
      rideStartedAt,
      surgeMultiplier = 1,
      fareConfig,
    } = rideData;

    // Get fare configuration
    if (!fareConfig) {
      throw new Error(`Fare configuration not found for car type: ${carType}`);
    }

    // Determine the day based on ride start time
    const rideDate = new Date(rideStartedAt);

    // Calculate components
    const rideSetupFee = fareConfig.rideSetupFee;
    const baseFare = fareConfig.baseFare;
    const surgeAmount = baseFare * surgeMultiplier - baseFare;
    const distanceFare = actualDistance * fareConfig.perKmFare;
    const timeFare = actualDuration * fareConfig.perMinuteFare;

    // Night charge based on ride start time
    const nightCharge = isNightTimeForDate(rideDate, fareConfig.nightTime)
      ? fareConfig.nightCharge * actualDistance
      : 0;

    // Waiting charge
    const waitingCharge =
      waitingTime > fareConfig.waiting.seconds
        ? ((waitingTime - fareConfig.waiting.seconds) / 60) *
          fareConfig.waiting.charge
        : 0;

    const discount =
      actualDuration <= fareConfig.discount?.minutes &&
      actualDistance <= fareConfig.discount?.distance
        ? fareConfig.discount?.charge
        : 0;

    const subtotal =
      rideSetupFee +
      baseFare * surgeMultiplier +
      distanceFare +
      timeFare +
      nightCharge +
      waitingCharge -
      discount;

    console.log('Subtotal before promo discount: ', subtotal);
    console.log(typeof subtotal);

    // Apply promo code
    let promoDiscount = 0;
    let promoDetails = null;

    const activePromoCodes = await findActivePromoCodes();
    if (activePromoCodes.length > 0) {
      const validPromo = activePromoCodes[0];
      if (validPromo) {
        promoDiscount = (subtotal * validPromo.discount) / 100;
        promoDetails = validPromo;
      }
    }

    // if (promoCode?.code && promoCode?.isApplied) {
    //   promoDiscount = (subtotal * promoCode.discount) / 100;
    //   promoDetails = promoCode;
    // }

    // if (promoCode) {
    //   const validPromo = await validatePromoCode(promoCode);
    //   if (validPromo) {
    //     promoDiscount = (subtotal * validPromo.discount) / 100;
    //     promoDetails = {
    //       code: validPromo.code,
    //       discount: validPromo.discount,
    //       isApplied: true,
    //     };
    //   }
    // }

    const finalAmount = Math.max(0, subtotal - promoDiscount);

    return {
      success: true,
      fareBreakdown: {
        rideSetupFee,
        baseFare,
        distanceFare,
        timeFare,
        nightCharge,
        waitingCharge,
        discount,
        subtotal,
        promoDiscount,
        surgeMultiplier,
        surgeAmount,
        finalAmount,
      },
      actualFare: parseFloat(finalAmount),
      promoDetails,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
};

// Helper function to check night time for a specific date
const isNightTimeForDate = (date, nightTimeConfig) => {
  const currentTime = date.getHours() * 60 + date.getMinutes();

  const [fromHour, fromMin] = nightTimeConfig.from.split(':').map(Number);
  const [toHour, toMin] = nightTimeConfig.to.split(':').map(Number);

  const fromTime = fromHour * 60 + fromMin;
  const toTime = toHour * 60 + toMin;

  if (fromTime > toTime) {
    return currentTime >= fromTime || currentTime <= toTime;
  }

  return currentTime >= fromTime && currentTime <= toTime;
};

// Helper function to check peak hour for a specific date
const isPeakHourForDate = (date) => {
  const hour = date.getHours();
  return (hour >= 7 && hour <= 10) || (hour >= 17 && hour <= 20);
};
