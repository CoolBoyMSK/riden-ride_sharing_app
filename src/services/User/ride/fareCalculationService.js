import { findActivePromoCodes } from '../../../dal/promo_code.js';

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

    // Helper function to round to 2 decimal places
    const roundToTwoDecimals = (value) => Math.round((value || 0) * 100) / 100;

    // Find the car type configuration within dailyFares
    const carTypeFare = fareConfig.dailyFares.find(
      (fare) => fare.carType === carType,
    );
    if (!carTypeFare) {
      throw new Error(`Fare configuration not found for ${carType} car type.`);
    }

    // Calculate base components and round to 2 decimals
    const rideSetupFee = roundToTwoDecimals(carTypeFare.rideSetupFee);
    const baseFare = roundToTwoDecimals(carTypeFare.baseFare);
    const distanceFare = roundToTwoDecimals(distance * carTypeFare.perKmFare);
    const timeFare = roundToTwoDecimals(
      duration ? duration * carTypeFare.perMinuteFare : 0,
    );
    const nightCharge = roundToTwoDecimals(
      isNightTime(carTypeFare.nightTime, scheduledTime)
        ? carTypeFare.nightCharge
        : 0,
    );

    // NEW FORMULA: Sum all components first, then apply surge multiplier
    const baseSubtotal = roundToTwoDecimals(
      rideSetupFee +
        baseFare +
        distanceFare +
        timeFare +
        nightCharge,
    );

    // Apply surge multiplier to the sum of all components
    const subtotalAfterSurge = roundToTwoDecimals(
      baseSubtotal * surgeMultiplier,
    );

    // Calculate surge amount (difference after applying surge)
    const surgeAmount = roundToTwoDecimals(
      subtotalAfterSurge - baseSubtotal,
    );

    // Subtotal is now after surge (discount will be applied later if needed)
    const subtotal = subtotalAfterSurge;

    // Return the exact same structure as before with all amounts rounded
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

    // Helper function to round to 2 decimal places
    const roundToTwoDecimals = (value) => Math.round((value || 0) * 100) / 100;

    // Get fare configuration
    if (!fareConfig) {
      throw new Error(`Fare configuration not found for car type: ${carType}`);
    }

    // Determine the day based on ride start time
    const rideDate = new Date(rideStartedAt);

    // Calculate components and round to 2 decimals
    const rideSetupFee = roundToTwoDecimals(fareConfig.rideSetupFee);
    const baseFare = roundToTwoDecimals(fareConfig.baseFare);
    const distanceFare = roundToTwoDecimals(
      actualDistance * fareConfig.perKmFare,
    );
    const timeFare = roundToTwoDecimals(
      actualDuration * fareConfig.perMinuteFare,
    );

    // Night charge based on ride start time
    const nightCharge = roundToTwoDecimals(
      isNightTimeForDate(rideDate, fareConfig.nightTime)
        ? fareConfig.nightCharge * actualDistance
        : 0,
    );

    // Waiting charge
    const waitingCharge = roundToTwoDecimals(
      waitingTime > fareConfig.waiting.seconds
        ? ((waitingTime - fareConfig.waiting.seconds) / 60) *
            fareConfig.waiting.charge
        : 0,
    );

    // NEW FORMULA: Sum all components first, then apply surge multiplier
    const baseSubtotal = roundToTwoDecimals(
      rideSetupFee +
        baseFare +
        distanceFare +
        timeFare +
        nightCharge +
        waitingCharge,
    );

    // Apply surge multiplier to the sum of all components
    const subtotalAfterSurge = roundToTwoDecimals(
      baseSubtotal * surgeMultiplier,
    );

    // Calculate surge amount (difference after applying surge)
    const surgeAmount = roundToTwoDecimals(
      subtotalAfterSurge - baseSubtotal,
    );

    // Discount removed from fare calculation (no longer required)
    const discount = 0;

    // Subtotal is after surge (discount removed)
    const subtotal = subtotalAfterSurge;

    console.log('Subtotal before promo discount: ', subtotal);
    console.log(typeof subtotal);

    // Apply promo code
    let promoDiscount = 0;
    let promoDetails = null;

    const activePromoCodes = await findActivePromoCodes();
    if (activePromoCodes.length > 0) {
      const validPromo = activePromoCodes[0];
      if (validPromo) {
        promoDiscount = roundToTwoDecimals(
          (subtotal * validPromo.discount) / 100,
        );
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

    const finalAmount = roundToTwoDecimals(
      Math.max(0, subtotal - promoDiscount),
    );

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
        surgeAmount: surgeAmount > 0 ? surgeAmount : 0,
        finalAmount,
      },
      actualFare: finalAmount,
      promoDetails,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
};

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
