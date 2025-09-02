import { getFareByCarType } from '../../../dal/fareManagement.js';
import { validatePromoCode } from '../../../dal/promo_code.js';

// Get current day of week
const getCurrentDay = () => {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  return days[new Date().getDay()];
};

// Check if current time is night time
const isNightTime = (nightTimeConfig) => {
  const now = new Date();
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

// Check if current time is peak hour (simplified - you can make this more sophisticated)
const isPeakHour = () => {
  const hour = new Date().getHours();
  // Peak hours: 7-10 AM and 5-8 PM
  return (hour >= 7 && hour <= 10) || (hour >= 17 && hour <= 20);
};

// Calculate estimated fare
export const calculateEstimatedFare = async (carType, distance, duration, promoCode = null) => {
  try {
    // Get fare configuration for the car type
    const fareConfig = await getFareByCarType(carType);
    if (!fareConfig) {
      throw new Error(`Fare configuration not found for car type: ${carType}`);
    }

    const currentDay = getCurrentDay();
    const dayFare = fareConfig.dailyFares.find(fare => fare.day === currentDay);
    
    if (!dayFare) {
      throw new Error(`Fare configuration not found for day: ${currentDay}`);
    }

    // Calculate base components
    const baseFare = dayFare.baseFare;
    const distanceFare = distance * dayFare.perKmFare;
    
    // Time-based fare (if duration is provided)
    const timeFare = duration ? (duration / 60) * (dayFare.perKmFare * 0.1) : 0;
    
    // Night charge
    const nightCharge = isNightTime(dayFare.nightTime) ? dayFare.nightCharge : 0;
    
    // Peak hour charge
    const peakCharge = isPeakHour() ? dayFare.peakCharge : 0;
    
    // Calculate subtotal
    const subtotal = baseFare + distanceFare + timeFare + nightCharge + peakCharge;
    
    // Apply promo code if provided
    let promoDiscount = 0;
    let promoDetails = null;
    
    if (promoCode) {
      const validPromo = await validatePromoCode(promoCode);
      if (validPromo) {
        promoDiscount = (subtotal * validPromo.discount) / 100;
        promoDetails = {
          code: validPromo.code,
          discount: validPromo.discount,
          isApplied: true
        };
      }
    }
    
    const finalAmount = Math.max(0, subtotal - promoDiscount);
    
    return {
      success: true,
      fareBreakdown: {
        baseFare,
        distanceFare,
        timeFare,
        nightCharge,
        peakCharge,
        waitingCharge: 0, // Will be calculated during actual ride
        subtotal,
        promoDiscount,
        finalAmount
      },
      estimatedFare: finalAmount,
      promoDetails,
      currency: 'USD' // You can make this configurable
    };
    
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
};

// Calculate actual fare (during/after ride completion)
export const calculateActualFare = async (rideData) => {
  try {
    const { 
      carType, 
      actualDistance, 
      actualDuration, 
      waitingTime = 0,
      promoCode,
      rideStartedAt,
      rideCompletedAt 
    } = rideData;

    // Get fare configuration
    const fareConfig = await getFareByCarType(carType);
    if (!fareConfig) {
      throw new Error(`Fare configuration not found for car type: ${carType}`);
    }

    // Determine the day based on ride start time
    const rideDate = new Date(rideStartedAt);
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const rideDay = days[rideDate.getDay()];
    
    const dayFare = fareConfig.dailyFares.find(fare => fare.day === rideDay);
    
    // Calculate components
    const baseFare = dayFare.baseFare;
    const distanceFare = actualDistance * dayFare.perKmFare;
    const timeFare = actualDuration ? (actualDuration / 60) * (dayFare.perKmFare * 0.1) : 0;
    
    // Night charge based on ride start time
    const nightCharge = isNightTimeForDate(rideDate, dayFare.nightTime) ? dayFare.nightCharge : 0;
    
    // Peak charge based on ride start time
    const peakCharge = isPeakHourForDate(rideDate) ? dayFare.peakCharge : 0;
    
    // Waiting charge
    const waitingCharge = waitingTime > dayFare.waiting.minutes ? 
      ((waitingTime - dayFare.waiting.minutes) / 60) * dayFare.waiting.charge : 0;
    
    const subtotal = baseFare + distanceFare + timeFare + nightCharge + peakCharge + waitingCharge;
    
    // Apply promo code
    let promoDiscount = 0;
    let promoDetails = null;
    
    if (promoCode?.code && promoCode?.isApplied) {
      promoDiscount = (subtotal * promoCode.discount) / 100;
      promoDetails = promoCode;
    }
    
    const finalAmount = Math.max(0, subtotal - promoDiscount);
    
    return {
      success: true,
      fareBreakdown: {
        baseFare,
        distanceFare,
        timeFare,
        nightCharge,
        peakCharge,
        waitingCharge,
        subtotal,
        promoDiscount,
        finalAmount
      },
      actualFare: finalAmount,
      promoDetails
    };
    
  } catch (error) {
    return {
      success: false,
      error: error.message
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



