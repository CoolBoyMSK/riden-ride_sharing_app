import {
  createRide,
  findActiveRideByPassenger,
  findScheduledRideByPassenger,
} from '../../../dal/ride.js';
import RideModel from '../../../models/Ride.js';
import { findPassengerData } from '../../../dal/passenger.js';
import {
  analyzeSurgePricing,
  startProgressiveDriverSearch,
  updateExistingRidesSurgePricing,
  findFareConfigurationForLocation,
  isAirportRide,
  stopDriverSearch,
  notifyDriversInRadius,
} from '../../../dal/driver.js';
import { calculateEstimatedFare } from './fareCalculationService.js';
import {
  notifyUser,
  createAdminNotification,
} from '../../../dal/notification.js';
import { CAR_TYPES, PASSENGER_ALLOWED } from '../../../enums/vehicleEnums.js';
import { PAYMENT_METHODS, CARD_TYPES } from '../../../enums/paymentEnums.js';
import { scheduledRideQueue } from '../../../scheduled/queues/index.js';
import {
  holdRidePayment,
  cancelPaymentHold,
  getPassengerWallet,
  captureCommissionAtBooking,
} from '../../../dal/stripe.js';

export const getFareEstimate = async (
  pickupLocation,
  dropoffLocation,
  carType,
  promoCode = null,
) => {
  try {
    if (!pickupLocation || !dropoffLocation || !carType) {
      return {
        success: false,
        message: 'Invalid pickup location, dropoff location, or car type',
      };
    }

    if (!pickupLocation.coordinates || !dropoffLocation.coordinates) {
      return {
        success: false,
        message: 'Invalid pickup location or dropoff location',
      };
    }

    if (!CAR_TYPES.includes(carType)) {
      return {
        success: false,
        message: 'Invalid car type',
      };
    }

    // Calculate distance and duration
    const distance = await calculateDistance(pickupLocation, dropoffLocation);
    const duration = estimateDuration(distance);

    const fareConfig = await findFareConfigurationForLocation(
      pickupLocation.coordinates,
      carType,
    );

    if (!fareConfig) {
      return {
        success: false,
        message: 'No fare configuration found for this location and car type',
      };
    }

    const surgeMultiplier = 1;

    // Calculate fare
    const fareResult = await calculateEstimatedFare(
      carType,
      distance,
      duration,
      promoCode,
      surgeMultiplier,
      fareConfig,
    );

    if (!fareResult.success) {
      return {
        success: false,
        message: fareResult.error,
      };
    }

    return {
      success: true,
      estimate: {
        distance: Math.round(distance * 100) / 100, // Round to 2 decimal places
        estimatedDuration: duration,
        fareBreakdown: fareResult.fareBreakdown,
        estimatedFare: fareResult.estimatedFare,
        promoDetails: fareResult.promoDetails,
        currency: fareResult.currency,
        passengersAllowed: PASSENGER_ALLOWED[carType].passengersAllowed,
        patientsAllowed: PASSENGER_ALLOWED[carType].patientsAllowed,
      },
    };
  } catch (error) {
    return {
      success: false,
      message: 'Failed to calculate fare estimate',
      error: error.message,
    };
  }
};

export const getAvailableCarTypes = async () => {
  try {
    return {
      success: true,
      carTypes: CAR_TYPES,
    };
  } catch (error) {
    return {
      success: false,
      message: 'Failed to get available car types',
      error: error.message,
    };
  }
};

const calculateDistance = async (pickup, dropoff) => {
  try {
    const response = await fetch(
      `http://router.project-osrm.org/route/v1/driving/${pickup.coordinates[0]},${pickup.coordinates[1]};${dropoff.coordinates[0]},${dropoff.coordinates[1]}?overview=false`,
    );

    const data = await response.json();

    if (data.code === 'Ok' && data.routes.length > 0) {
      const distanceInMeters = data.routes[0].distance;
      const distanceInKm = distanceInMeters / 1000;
      return distanceInKm;
    } else {
      throw new Error('Failed to calculate distance from OSRM');
    }
  } catch (error) {
    console.error('OSRM API error:', error);
    const straightDistance = calculateHaversineDistance(pickup, dropoff);
    let multiplier = 1.3;

    // You can enhance this by detecting if coordinates are in urban area
    // For now, using a conservative multiplier
    if (straightDistance > 20) {
      multiplier = 1.2; // Longer distances tend to be more direct
    } else if (straightDistance < 5) {
      multiplier = 1.4; // Short distances in cities have more detours
    }

    return straightDistance * multiplier;
  }
};

const calculateHaversineDistance = (pickup, dropoff) => {
  const R = 6371; // Earth's radius in kilometers
  const dLat =
    ((dropoff.coordinates[1] - pickup.coordinates[1]) * Math.PI) / 180;
  const dLon =
    ((dropoff.coordinates[0] - pickup.coordinates[0]) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((pickup.coordinates[1] * Math.PI) / 180) *
      Math.cos((dropoff.coordinates[1] * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return distance;
};

const estimateDuration = (distance) => {
  const averageSpeed = 30; // km/h in city traffic
  return Math.ceil((distance / averageSpeed) * 60); // minutes
};

export const bookRide = async (userId, rideData) => {
  const startTime = Date.now();
  let ride = null;
  let paymentHoldResult = null;

  try {
    const {
      pickupLocation,
      dropoffLocation,
      carType,
      bookedFor,
      bookedForName,
      bookedForPhoneNumber,
      paymentMethod,
      paymentMethodId,
      cardType,
      promoCode,
      scheduledTime,
      specialRequests,
    } = rideData;

    // Input validation
    const validationError = validateRideInput(rideData);
    if (validationError) return validationError;

    // Find passenger profile
    const passenger = await findPassengerData(userId);
    if (!passenger) {
      return {
        success: false,
        message: 'Passenger profile not found',
      };
    }

    // Check for active rides
    const activeRide = await findActiveRideByPassenger(passenger._id);
    if (activeRide && !activeRide.isScheduledRide) {
      return {
        success: false,
        message: 'You already have an active ride',
        activeRide: activeRide,
      };
    }

    const scheduledRide = await findScheduledRideByPassenger(passenger._id);
    if (scheduledRide === false) {
      return {
        success: false,
        message:
          'You already have a scheduled ride within 45 minutes. Please wait before booking another ride.',
      };
    } else if (scheduledRide) {
      const notifyPassenger = await notifyUser({
        userId: passenger.userId?._id,
        title: 'Scheduled Ride Reminder',
        message: `You have a scheduled ride in ${scheduledRide.remainingTime}. ${scheduledRide.ride.bookedFor === 'SOMEONE' ? `For ${scheduledRide.ride.bookedForName} with phone number ${scheduledRide.ride.bookedForPhoneNumber}` : ''}`,
        module: 'ride',
        metadata: scheduledRide.ride,
      });
      if (!notifyPassenger) {
        console.error('Failed to send notification');
      }
    }

    if (bookedFor === 'SOMEONE') {
      if (!bookedForName || !bookedForPhoneNumber) {
        return {
          success: false,
          message:
            'Name and phone number are required when booking ride for someone else',
        };
      }

      const name = bookedForName.trim();
      const phoneNumber = bookedForPhoneNumber.trim();

      if (name.length === 0 || phoneNumber.length === 0) {
        return {
          success: false,
          message:
            'Name and phone number are required when booking ride for someone else',
        };
      }

      if (name.length < 3) {
        return {
          success: false,
          message: 'Name must be at least 3 characters long',
        };
      }

      if (!/^[0-9+\- ]{7,20}$/.test(phoneNumber)) {
        return {
          success: false,
          message:
            'Phone number must be 7-20 characters and contain only digits, +, -, or spaces.',
        };
      }
    }

    // Parallel execution for better performance
    const [distance, airport, surgeAnalysis] = await Promise.all([
      calculateDistance(pickupLocation, dropoffLocation),
      isAirportRide(pickupLocation.coordinates),
      analyzeSurgePricing(pickupLocation.coordinates, carType),
    ]);

    // Validate calculations
    if (distance <= 0) {
      return {
        success: false,
        message: 'Invalid distance calculated. Please check locations.',
      };
    }

    const duration = estimateDuration(distance);

    const {
      surgeDataWithCurrentRide,
      currentSurgeData,
      shouldUpdateExistingRides,
      surgeMultiplier,
      isSurgeApplied,
    } = surgeAnalysis;

    // Log surge analysis results
    if (isSurgeApplied) {
      console.log(
        shouldUpdateExistingRides
          ? `SURGE ${!currentSurgeData.isSurge ? 'ACTIVATED' : 'LEVEL INCREASED'} by current ride`
          : `SURGE APPLIED (existing level)`,
      );
    }

    const fareConfig = await findFareConfigurationForLocation(
      pickupLocation.coordinates,
      carType,
    );
    if (!fareConfig) {
      return {
        success: false,
        message: 'No fare configuration found for this location and car type',
      };
    }

    let fareResult;
    if (scheduledTime) {
      console.log('📅 [VALIDATION] Validating scheduled ride time', {
        userId,
        scheduledTime,
        currentTime: new Date().toISOString(),
        timestamp: new Date().toISOString(),
      });
      
      const time = new Date(scheduledTime);
      const now = new Date();

      const MIN_SCHEDULE_MS = 1 * 60 * 1000; // 1 minute
      const MAX_SCHEDULE_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

      if (time < now) {
        console.warn('⚠️ [VALIDATION] Scheduled time is in the past', {
          userId,
          scheduledTime: time.toISOString(),
          currentTime: now.toISOString(),
          timeDifferenceMs: time.getTime() - now.getTime(),
          timestamp: new Date().toISOString(),
        });
        return {
          success: false,
          message:
            'Scheduled time must be in the future. You can schedule a ride at least 1 minute and up to 3 days from now.',
        };
      }

      const timeDifference = time.getTime() - now.getTime();

      console.log('⏰ [VALIDATION] Scheduled time validation', {
        userId,
        scheduledTime: time.toISOString(),
        currentTime: now.toISOString(),
        timeDifferenceMs: timeDifference,
        timeDifferenceMinutes: Math.floor(timeDifference / (60 * 1000)),
        minScheduleMs: MIN_SCHEDULE_MS,
        maxScheduleMs: MAX_SCHEDULE_MS,
        timestamp: new Date().toISOString(),
      });

      if (timeDifference < MIN_SCHEDULE_MS) {
        const minutesFromNow = Math.ceil(MIN_SCHEDULE_MS / (60 * 1000));
        console.warn('⚠️ [VALIDATION] Scheduled time is too soon', {
          userId,
          scheduledTime: time.toISOString(),
          timeDifferenceMs: timeDifference,
          requiredMinutes: minutesFromNow,
          timestamp: new Date().toISOString(),
        });
        return {
          success: false,
          message: `You can schedule a ride at least ${minutesFromNow} minute from now.`,
        };
      }

      if (timeDifference > MAX_SCHEDULE_MS) {
        const hoursFromNow = Math.floor(MAX_SCHEDULE_MS / (60 * 60 * 1000));
        console.warn('⚠️ [VALIDATION] Scheduled time is too far in the future', {
          userId,
          scheduledTime: time.toISOString(),
          timeDifferenceMs: timeDifference,
          maxHours: hoursFromNow,
          timestamp: new Date().toISOString(),
        });
        return {
          success: false,
          message: `You can schedule a ride up to ${hoursFromNow} hours (3 days) from now.`,
        };
      }

      console.log('✅ [VALIDATION] Scheduled time validation passed', {
        userId,
        scheduledTime: time.toISOString(),
        timeDifferenceMinutes: Math.floor(timeDifference / (60 * 1000)),
        timestamp: new Date().toISOString(),
      });

      fareResult = await calculateEstimatedFare(
        carType,
        distance,
        duration,
        promoCode,
        surgeMultiplier,
        fareConfig,
        time,
      );
    } else {
      fareResult = await calculateEstimatedFare(
        carType,
        distance,
        duration,
        promoCode,
        surgeMultiplier,
        fareConfig,
      );
    }

    if (!fareResult.success) {
      return {
        success: false,
        message: fareResult.error || 'Failed to calculate fare',
      };
    }

    // Validate payment method
    const paymentValidation = await validatePaymentMethod(
      passenger,
      paymentMethod,
      paymentMethodId,
    );
    if (!paymentValidation.success) return paymentValidation;

    if (paymentMethod === 'CARD' && !CARD_TYPES.includes(cardType)) {
      return {
        success: false,
        message: 'Invalid card type',
      };
    }

    // Handle payment based on payment method type
    if (paymentMethod === 'WALLET') {
      // For wallet payments, check balance but don't deduct yet (deduction happens on ride completion)
      const wallet = await getPassengerWallet(passenger._id);
      if (!wallet) {
        return {
          success: false,
          message: 'Wallet not found. Please contact support.',
        };
      }

      const estimatedAmount = fareResult.estimatedFare;
      const availableBalance = wallet.availableBalance || 0;

      // Check if wallet has sufficient balance (allow negative balance for now, will be handled on completion)
      // We just verify wallet exists, actual payment happens on ride completion
      console.log(`💳 [WALLET] Wallet balance check: ${availableBalance} available, ${estimatedAmount} required`);
      
      // Set paymentHoldResult to success for wallet (no Stripe hold needed)
      paymentHoldResult = {
        success: true,
        paymentMethod: 'WALLET',
        walletBalance: availableBalance,
        estimatedAmount: estimatedAmount,
      };
    } else if (PAYMENT_METHODS.includes(paymentMethod) && paymentMethodId) {
      // Hold/authorize payment for card, Google Pay, and Apple Pay payments
      const estimatedAmount = fareResult.estimatedFare;
      console.log('Start');
      paymentHoldResult = await holdRidePayment(
        passenger,
        estimatedAmount,
        paymentMethodId,
        paymentMethod,
        cardType,
      );
      console.log('paymentHoldResult:', paymentHoldResult);
      console.log('end');
      if (!paymentHoldResult.success) {
        return {
          success: false,
          message:
            paymentHoldResult.error ||
            'Failed to authorize payment. Please check your payment method and try again.',
        };
      }

      // Commission will be captured after ride creation (we need rideId)
    } else if (paymentMethod === 'CASH') {
      // Cash payment - no authorization needed
      paymentHoldResult = {
        success: true,
        paymentMethod: 'CASH',
      };
    } else {
      return {
        success: false,
        message: 'Payment method not supported',
      };
    }

    // ========== CONSOLE LOGS FOR RIDE BOOKING ==========
    console.log('\n' + '='.repeat(80));
    console.log('🚕 RIDE BOOKING REQUEST');
    console.log('='.repeat(80));
    console.log(`👤 Passenger ID: ${passenger._id}`);
    console.log(`👤 Passenger Name: ${passenger.name || 'N/A'}`);
    console.log(`⏰ Timestamp: ${new Date().toISOString()}`);
    console.log(`\n📍 Pickup Location:`);
    console.log(`   Address: ${pickupLocation.address || 'N/A'}`);
    console.log(`   Place Name: ${pickupLocation.placeName || 'N/A'}`);
    console.log(`   Coordinates: [${pickupLocation.coordinates[0]}, ${pickupLocation.coordinates[1]}]`);
    console.log(`\n📍 Dropoff Location:`);
    console.log(`   Address: ${dropoffLocation.address || 'N/A'}`);
    console.log(`   Place Name: ${dropoffLocation.placeName || 'N/A'}`);
    console.log(`   Coordinates: [${dropoffLocation.coordinates[0]}, ${dropoffLocation.coordinates[1]}]`);
    console.log(`\n🏢 AIRPORT DETECTION:`);
    console.log(`   isAirport: ${airport ? true : false}`);
    if (airport) {
      console.log(`   Airport Name: ${airport.name || 'N/A'}`);
      console.log(`   Airport ID: ${airport._id || 'N/A'}`);
      console.log(`   ✅ This is an AIRPORT RIDE - Will be sent to parking queue`);
    } else {
      console.log(`   ✅ This is a REGULAR RIDE - Normal driver search`);
    }
    console.log(`\n🚗 Ride Details:`);
    console.log(`   Car Type: ${carType}`);
    console.log(`   Distance: ${distance} km`);
    console.log(`   Duration: ${duration} minutes`);
    console.log(`   Payment Method: ${paymentMethod}`);
    console.log('='.repeat(80) + '\n');
    // ========== END CONSOLE LOGS ==========

    // Create ride record
    ride = await createRideRecord({
      passenger,
      pickupLocation,
      dropoffLocation,
      carType,
      paymentMethod,
      paymentMethodId,
      scheduledTime,
      specialRequests,
      distance,
      duration,
      isAirport: airport ? true : false,
      airport: airport ? airport : {},
      fareResult,
      surgeMultiplier,
      isSurgeApplied,
      surgeData: surgeDataWithCurrentRide,
      fareConfig,
      isScheduledRide: scheduledTime ? true : false,
      status: scheduledTime ? 'SCHEDULED' : 'REQUESTED',
      bookedFor,
      bookedForName,
      bookedForPhoneNumber,
      passengersAllowed: PASSENGER_ALLOWED[carType].passengersAllowed,
      patientsAllowed: PASSENGER_ALLOWED[carType].patientsAllowed,
      paymentIntentId: paymentHoldResult?.paymentIntentId || null,
      cardType,
    });

    // Capture 20% commission at booking time (after ride is created)
    // Only for Stripe payments (CARD, GOOGLE_PAY, APPLE_PAY)
    // Wallet and Cash payments handle commission at ride completion
    if (
      paymentHoldResult?.success &&
      ride?._id &&
      paymentMethod !== 'WALLET' &&
      paymentMethod !== 'CASH' &&
      paymentHoldResult?.paymentIntentId
    ) {
      const commissionResult = await captureCommissionAtBooking(
        paymentHoldResult.paymentIntentId,
        fareResult.estimatedFare,
        ride._id,
        carType,
        fareResult.fareBreakdown?.promoDiscount || 0,
      );

      if (!commissionResult.success) {
        // If commission capture fails, cancel the payment hold and cleanup
        await cancelPaymentHold(paymentHoldResult.paymentIntentId).catch(
          (cancelError) => {
            console.error('Failed to cancel payment hold:', cancelError);
          },
        );
        await cleanupFailedRide(ride._id).catch((cleanupError) => {
          console.error('Cleanup failed:', cleanupError);
        });
        return {
          success: false,
          message:
            commissionResult.error ||
            'Failed to process commission. Please try again.',
        };
      }

      console.log('Commission captured at booking:', commissionResult);
    } else if (paymentMethod === 'WALLET' || paymentMethod === 'CASH') {
      console.log(
        `💳 [${paymentMethod}] Commission will be handled at ride completion`,
      );
    }

    if (!ride) {
      return {
        success: false,
        message: 'Failed to create ride record. Please try again.',
      };
    }

    // Ensure ride is a plain object for queue processing
    // Convert Mongoose document to plain object if needed
    const rideObject = ride.toObject ? ride.toObject() : ride;

    if (rideObject.isScheduledRide) {
      console.log('📅 [SCHEDULED RIDE FLOW] Starting scheduled ride booking process', {
        rideId: rideObject._id,
        passengerId: passenger._id,
        userId: userId,
        scheduledTime: rideObject.scheduledTime,
        bookedFor: rideObject.bookedFor,
        bookedForName: rideObject.bookedForName,
        status: rideObject.status,
        paymentMethod: rideObject.paymentMethod,
        paymentIntentId: rideObject.paymentIntentId,
        timestamp: new Date().toISOString(),
      });

      const notifyPassenger = await notifyUser({
        userId: passenger.userId?._id,
        title: 'Scheduling Request Sent',
        message: `Your scheduling request has been sent successfully. You will be notified when the request is responded by the admin.`,
        module: 'ride',
        metadata: rideObject,
      });
      if (!notifyPassenger) {
        console.error('❌ [SCHEDULED RIDE FLOW] Failed to send passenger notification', {
          rideId: rideObject._id,
          userId: passenger.userId?._id,
        });
      } else {
        console.log('✅ [SCHEDULED RIDE FLOW] Passenger notification sent', {
          rideId: rideObject._id,
          userId: passenger.userId?._id,
        });
      }

      if (rideObject.bookedFor === 'SOMEONE') {
        console.log('📤 [SCHEDULED RIDE FLOW] Sending admin notification for ride booked for someone else', {
          rideId: rideObject._id,
          bookedForName: rideObject.bookedForName,
          bookedForPhoneNumber: rideObject.bookedForPhoneNumber,
        });
        const notifyAdmin = await createAdminNotification({
          title: 'New Ride Scheduling Request',
          message: `A new scheduling request has been sent by ${rideObject.userId?.name} for ${rideObject.bookedForName} with phone number ${rideObject.bookedForPhoneNumber}`,
          metadata: rideObject,
          module: 'ride',
        });
        if (!notifyAdmin) {
          console.error('❌ [SCHEDULED RIDE FLOW] Failed to send admin notification', {
            rideId: rideObject._id,
          });
        } else {
          console.log('✅ [SCHEDULED RIDE FLOW] Admin notification sent', {
            rideId: rideObject._id,
          });
        }
      } else {
        console.log('📤 [SCHEDULED RIDE FLOW] Sending admin notification for self-booking', {
          rideId: rideObject._id,
          passengerName: passenger.userId?.name,
        });
        const notifyAdmin = await createAdminNotification({
          title: 'New Ride Scheduling Request',
          message: `A new scheduling request has been sent by a ${passenger.userId?.name}`,
          metadata: rideObject,
          module: 'ride',
        });
        if (!notifyAdmin) {
          console.error('❌ [SCHEDULED RIDE FLOW] Failed to send admin notification', {
            rideId: rideObject._id,
          });
        } else {
          console.log('✅ [SCHEDULED RIDE FLOW] Admin notification sent', {
            rideId: rideObject._id,
          });
        }
      }

      // Add scheduled ride to queue for processing
      try {
        console.log('🚀 [SCHEDULED RIDE FLOW] Attempting to add scheduled ride to queue', {
          rideId: rideObject._id,
          scheduledTime: rideObject.scheduledTime,
          isScheduledRide: rideObject.isScheduledRide,
          status: rideObject.status,
          timestamp: new Date().toISOString(),
        });
        await addScheduledRideToQueue(rideObject);
        console.log('✅ [SCHEDULED RIDE FLOW] Scheduled ride successfully added to queue', {
          rideId: rideObject._id,
          scheduledTime: rideObject.scheduledTime,
          timestamp: new Date().toISOString(),
        });
      } catch (queueError) {
        console.error('❌ [SCHEDULED RIDE FLOW] Failed to add scheduled ride to queue', {
          rideId: rideObject._id,
          error: queueError.message,
          stack: queueError.stack,
          scheduledTime: rideObject.scheduledTime,
          timestamp: new Date().toISOString(),
        });
        // Still return success since ride is created, but log the error
      }
      
      try {
        console.log('📢 [SCHEDULED RIDE FLOW] Notifying drivers within 20km radius', {
          rideId: rideObject._id,
          pickupLocation: rideObject.pickupLocation,
          radius: 20,
          timestamp: new Date().toISOString(),
        });
        const notificationResult = await notifyDriversInRadius(
          rideObject,
          20,
          0,
        );
        if (notificationResult) {
          console.log('✅ [SCHEDULED RIDE FLOW] Drivers notified successfully', {
            rideId: rideObject._id,
            notificationResult: notificationResult,
            timestamp: new Date().toISOString(),
          });
        } else {
          console.log('ℹ️ [SCHEDULED RIDE FLOW] No drivers found in 20km radius', {
            rideId: rideObject._id,
            timestamp: new Date().toISOString(),
          });
        }
      } catch (notificationError) {
        console.error('❌ [SCHEDULED RIDE FLOW] Failed to notify drivers', {
          rideId: rideObject._id,
          error: notificationError.message,
          stack: notificationError.stack,
          timestamp: new Date().toISOString(),
        });
      }

      console.log('✅ [SCHEDULED RIDE FLOW] Scheduled ride booking completed successfully', {
        rideId: rideObject._id,
        scheduledTime: rideObject.scheduledTime,
        status: rideObject.status,
        timestamp: new Date().toISOString(),
      });

      return {
        success: true,
        message: 'Scheduling request sent successfully',
        ride: rideObject,
      };
    }

    // Update existing rides if surge was activated/increased (non-blocking)
    if (shouldUpdateExistingRides) {
      updateExistingRidesSurgePricing(
        pickupLocation.coordinates,
        carType,
        surgeMultiplier,
        surgeDataWithCurrentRide.surgeLevel,
      ).catch((error) => {
        console.error('Background surge update failed:', error);
      });
    }

    // Start driver search (non-blocking)
    startProgressiveDriverSearch(ride).catch((error) => {
      console.error('Background driver search failed:', error);
    });

    const processingTime = Date.now() - startTime;
    console.log(`Ride ${ride._id} booked successfully in ${processingTime}ms`);

    return {
      success: true,
      message: 'Ride booked successfully. Searching for drivers...',
      ride: ride,
      metadata: {
        processingTime: `${processingTime}ms`,
        surgeApplied: isSurgeApplied,
        surgeLevel: surgeDataWithCurrentRide.surgeLevel,
        searchRadius: '5km',
      },
    };
  } catch (error) {
    console.error('Ride booking error:', error);

    // Cleanup on error
    // Release payment hold if it was created (only for Stripe payments)
    if (
      paymentHoldResult?.success &&
      paymentHoldResult?.paymentIntentId &&
      paymentMethod !== 'WALLET' &&
      paymentMethod !== 'CASH'
    ) {
      await cancelPaymentHold(paymentHoldResult.paymentIntentId).catch(
        (cancelError) => {
          console.error('Failed to cancel payment hold:', cancelError);
        },
      );
    }

    // Cleanup ride if it was created
    if (ride?._id) {
      await cleanupFailedRide(ride._id).catch((cleanupError) => {
        console.error('Cleanup failed:', cleanupError);
      });
    }

    return {
      success: false,
      message: 'Failed to book ride. Please try again.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    };
  }
};

const validateRideInput = (rideData) => {
  const { pickupLocation, dropoffLocation, carType, paymentMethod } = rideData;

  if (!pickupLocation || !dropoffLocation || !carType || !paymentMethod) {
    return {
      success: false,
      message:
        'Missing required fields: pickupLocation, dropoffLocation, carType, paymentMethod',
    };
  } else if (!CAR_TYPES.includes(carType)) {
    return {
      success: false,
      message: `Car type must be one of: ${CAR_TYPES.join(', ')}`,
    };
  } else if (!PASSENGER_ALLOWED[carType]) {
    return {
      success: false,
      message: `Passengers allowed must be greater than 0`,
    };
  } else if (PASSENGER_ALLOWED[carType].patientsAllowed < 0) {
    return {
      success: false,
      message: `Patients allowed must be greater than 0`,
    };
  }

  return null;
};

const validatePaymentMethod = async (
  passenger,
  paymentMethod,
  paymentMethodId,
) => {
  // Validate CARD, GOOGLE_PAY, or APPLE_PAY - all require a payment method ID
  if (
    paymentMethod === 'CARD' ||
    paymentMethod === 'GOOGLE_PAY' ||
    paymentMethod === 'APPLE_PAY'
  ) {
    if (!paymentMethodId) {
      return {
        success: false,
        message: 'Payment method ID is required',
      };
    }
  } else if (paymentMethod === 'WALLET') {
    const wallet = await getPassengerWallet(passenger._id);
    if (!wallet) {
      return {
        success: false,
        message: 'Wallet not found',
      };
    }
  } else if (paymentMethod !== 'CASH') {
    return {
      success: false,
      message: 'Invalid payment method',
    };
  }

  return { success: true, wallet: null };
};

const createRideRecord = async (params) => {
  const {
    passenger,
    pickupLocation,
    dropoffLocation,
    carType,
    paymentMethod,
    paymentMethodId,
    scheduledTime,
    specialRequests,
    distance,
    duration,
    isAirport,
    airport,
    fareResult,
    surgeMultiplier,
    isSurgeApplied,
    surgeData,
    fareConfig,
    isScheduledRide,
    status,
    bookedFor,
    bookedForName,
    bookedForPhoneNumber,
    passengersAllowed,
    patientsAllowed,
    paymentIntentId,
    cardType,
  } = params;

  const ridePayload = {
    passengerId: passenger._id,
    pickupLocation,
    dropoffLocation,
    carType,
    paymentMethod,
    paymentIntentId,
    paymentMethodId,
    ...(cardType && { cardType }),
    scheduledTime: scheduledTime ? new Date(scheduledTime) : null,
    ...(specialRequests && { specialRequests }),
    estimatedDistance: distance,
    estimatedDuration: duration,
    estimatedFare: fareResult.estimatedFare,
    fareBreakdown: fareResult.fareBreakdown,
    status,
    isAirport,
    airport,
    searchRadius: 5,
    searchStartTime: new Date(),
    expiryTime: new Date(Date.now() + 5 * 60 * 1000),
    surgeMultiplier,
    isSurgeApplied,
    surgeLevel: surgeData.surgeLevel,
    surgeData,
    fareConfig: fareResult.fareConfig,
    fareConfigType: fareConfig.zone ? 'zone' : 'default',
    zoneName: fareConfig.zone?.name || 'default',
    createdAt: new Date(),
    isScheduledRide,
    bookedFor,
    bookedForName,
    bookedForPhoneNumber,
    passengersAllowed,
    patientsAllowed,
  };

  return await createRide(ridePayload);
};

const addScheduledRideToQueue = async (ride) => {
  const startTime = Date.now();
  try {
    console.log('🔍 [QUEUE] addScheduledRideToQueue called', {
      rideId: ride?._id,
      scheduledTime: ride?.scheduledTime,
      isScheduledRide: ride?.isScheduledRide,
      status: ride?.status,
      timestamp: new Date().toISOString(),
    });

    if (!ride) {
      console.error('❌ [QUEUE] Ride object is null or undefined', {
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Ensure ride._id exists (might be a Mongoose document)
    const rideId = ride._id?.toString() || ride._id;
    if (!rideId) {
      console.error('❌ [QUEUE] Ride ID is missing', {
        rideKeys: Object.keys(ride || {}),
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (!ride.scheduledTime || !ride.isScheduledRide) {
      console.error('❌ [QUEUE] Ride is not a scheduled ride', {
        rideId: rideId,
        scheduledTime: ride.scheduledTime,
        isScheduledRide: ride.isScheduledRide,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const scheduledTime = new Date(ride.scheduledTime);
    const now = new Date();
    const timeUntilScheduled = scheduledTime.getTime() - now.getTime();

    console.log('⏰ [QUEUE] Time calculations', {
      rideId: rideId,
      scheduledTime: scheduledTime.toISOString(),
      currentTime: now.toISOString(),
      timeUntilScheduledMs: timeUntilScheduled,
      timeUntilScheduledMinutes: Math.floor(timeUntilScheduled / (60 * 1000)),
      timestamp: new Date().toISOString(),
    });

    if (timeUntilScheduled <= 0) {
      console.error('❌ [QUEUE] Scheduled time is in the past', {
        rideId: rideId,
        scheduledTime: scheduledTime.toISOString(),
        now: now.toISOString(),
        timeUntilScheduled: timeUntilScheduled,
        timeDifferenceMinutes: Math.floor(timeUntilScheduled / (60 * 1000)),
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Calculate delays in milliseconds
    const notificationDelay = Math.max(0, timeUntilScheduled - 5 * 60 * 1000); // 5 minutes before
    const activationDelay = timeUntilScheduled; // At scheduled time
    const cancellationDelay = timeUntilScheduled + 5 * 60 * 1000; // 5 minutes after scheduled time

    console.log('📅 [QUEUE] Calculating job delays', {
      rideId: rideId,
      scheduledTime: scheduledTime.toISOString(),
      notificationDelayMs: notificationDelay,
      notificationDelayMinutes: Math.floor(notificationDelay / (60 * 1000)),
      activationDelayMs: activationDelay,
      activationDelayMinutes: Math.floor(activationDelay / (60 * 1000)),
      cancellationDelayMs: cancellationDelay,
      cancellationDelayMinutes: Math.floor(cancellationDelay / (60 * 1000)),
      timestamp: new Date().toISOString(),
    });

    // Job 1: Send notification (5 minutes before scheduled time, or immediately if less than 5 minutes)
    console.log('📤 [QUEUE] Adding notification job', {
      rideId: rideId,
      delay: notificationDelay,
      jobId: `scheduled-ride-notification-${rideId}`,
      timestamp: new Date().toISOString(),
    });
    const notificationJob = await scheduledRideQueue.add(
      'send-notification',
      {
        rideId: rideId,
        jobType: 'send_notification',
      },
      {
        delay: notificationDelay,
        jobId: `scheduled-ride-notification-${rideId}`,
        removeOnComplete: true,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    );
    console.log('✅ [QUEUE] Notification job added successfully', {
      rideId: rideId,
      jobId: notificationJob.id,
      jobName: notificationJob.name,
      delay: notificationDelay,
      timestamp: new Date().toISOString(),
    });

    // Job 2: Activate ride at scheduled time (change status to REQUESTED and start driver search)
    console.log('🚀 [QUEUE] Adding activation job', {
      rideId: rideId,
      delay: activationDelay,
      jobId: `scheduled-ride-activate-${rideId}`,
      timestamp: new Date().toISOString(),
    });
    const activationJob = await scheduledRideQueue.add(
      'activate-ride',
      {
        rideId: rideId,
        jobType: 'activate_ride',
      },
      {
        delay: activationDelay,
        jobId: `scheduled-ride-activate-${rideId}`,
        removeOnComplete: true,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    );
    console.log('✅ [QUEUE] Activation job added successfully', {
      rideId: rideId,
      jobId: activationJob.id,
      jobName: activationJob.name,
      delay: activationDelay,
      timestamp: new Date().toISOString(),
    });

    // // Job 3: Cancel ride if no response after scheduled time + 5 minutes
    // const cancellationJob = await scheduledRideQueue.add(
    //   'cancel-if-no-response',
    //   {
    //     rideId: rideId,
    //     jobType: 'cancel_if_no_response',
    //   },
    //   {
    //     delay: cancellationDelay,
    //     jobId: `scheduled-ride-cancel-${rideId}`,
    //     removeOnComplete: true,
    //     attempts: 2,
    //     backoff: {
    //       type: 'exponential',
    //       delay: 2000,
    //     },
    //   },
    // );
    // console.log('✅ Cancellation job added:', cancellationJob.id);

    // Verify jobs were added by checking queue
    const waitingJobs = await scheduledRideQueue.getWaiting();
    const delayedJobs = await scheduledRideQueue.getDelayed();
    console.log('📊 [QUEUE] Queue status after adding jobs', {
      rideId: rideId,
      waitingJobs: waitingJobs.length,
      delayedJobs: delayedJobs.length,
      totalJobs: waitingJobs.length + delayedJobs.length,
      timestamp: new Date().toISOString(),
    });

    const processingTime = Date.now() - startTime;
    console.log('✅ [QUEUE] Scheduled ride added to queue successfully', {
      rideId: rideId,
      notificationJobId: notificationJob.id,
      activationJobId: activationJob.id,
      notificationDelayMinutes: Math.floor(notificationDelay / (60 * 1000)),
      activationDelayMinutes: Math.floor(activationDelay / (60 * 1000)),
      cancellationDelayMinutes: Math.floor(cancellationDelay / (60 * 1000)),
      processingTimeMs: processingTime,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error('❌ [QUEUE] Error adding scheduled ride to queue', {
      rideId: ride?._id,
      error: error.message,
      stack: error.stack,
      processingTimeMs: processingTime,
      timestamp: new Date().toISOString(),
    });
    throw error; // Re-throw to be caught by caller
  }
};

const cleanupFailedRide = async (rideId) => {
  try {
    await RideModel.findByIdAndDelete(rideId);
    await stopDriverSearch(rideId);
    console.log(`Cleaned up failed ride: ${rideId}`);
  } catch (error) {
    console.error(`Failed to cleanup ride ${rideId}:`, error);
  }
};
