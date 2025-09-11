import {
  getFareEstimate,
  bookRide,
  cancelRide,
  getAvailableCarTypes,
} from '../../services/User/ride/rideBookingService.js';
import {
  getRideStatus,
  getCurrentRide,
  getDriverLocation,
  updateDriverLocation,
  startRide,
  completeRide,
  updateRideStatus,
  getRideHistory,
  getUserRideStats,
} from '../../services/User/ride/rideTrackingService.js';
import {
  processRidePayment,
  refundPayment,
  getUserPaymentMethods,
  getRideCostBreakdown,
} from '../../services/User/ride/paymentService.js';
import { validatePromoCode } from '../../dal/promo_code.js';
import { createResponseObject } from '../../utils/responseFactory.js';
import {
  getMessagesByRide,
  markAllMessagesRead,
  getChatStats,
  getUnreadMessageCount,
} from '../../dal/chat.js';
import { findDriverByUserId } from '../../dal/driver.js';

// Passenger Controllers

// Get fare estimate
export const getFareEstimateController = async (req, res) => {
  try {
    const { pickupLocation, dropoffLocation, carType, promoCode } = req.body;

    const result = await getFareEstimate(
      pickupLocation,
      dropoffLocation,
      carType,
      promoCode,
    );

    if (result.success) {
      return res.status(200).json({
        success: true,
        data: result.estimate,
      });
    } else {
      return res.status(400).json({
        success: false,
        message: result.message,
      });
    }
  } catch (error) {
    console.error('Get fare estimate error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get fare estimate',
    });
  }
};

// Book a ride
export const bookRideController = async (req, res) => {
  try {
    const userId = req.user.id;
    const rideData = req.body;

    const result = await bookRide(userId, rideData);

    if (result.success) {
      return res.status(201).json({
        success: true,
        message: result.message,
        data: result.ride,
        driverSearchInfo: result.driverSearchInfo,
      });
    } else {
      return res.status(400).json({
        success: false,
        message: result.message,
        activeRide: result.activeRide,
      });
    }
  } catch (error) {
    console.error('Book ride error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to book ride',
    });
  }
};

// Cancel ride
export const cancelRideController = async (req, res) => {
  try {
    const { rideId } = req.params;
    const userId = req.user.id;
    const { reason } = req.body;

    const result = await cancelRide(rideId, userId, reason);

    if (result.success) {
      return res.status(200).json({
        success: true,
        message: result.message,
        data: result.ride,
      });
    } else {
      return res.status(400).json({
        success: false,
        message: result.message,
      });
    }
  } catch (error) {
    console.error('Cancel ride error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to cancel ride',
    });
  }
};

// Get current ride
export const getCurrentRideController = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await getCurrentRide(userId);

    return res.status(200).json({
      success: result.success,
      message: result.message,
      data: result.ride,
    });
  } catch (error) {
    console.error('Get current ride error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get current ride',
    });
  }
};

// Get ride status
export const getRideStatusController = async (req, res) => {
  try {
    const { rideId } = req.params;

    const result = await getRideStatus(rideId);

    if (result.success) {
      return res.status(200).json({
        success: true,
        data: result.ride,
      });
    } else {
      return res.status(404).json({
        success: false,
        message: result.message,
      });
    }
  } catch (error) {
    console.error('Get ride status error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get ride status',
    });
  }
};

// Get driver location
export const getDriverLocationController = async (req, res) => {
  try {
    const { rideId } = req.params;

    const result = await getDriverLocation(rideId);

    if (result.success) {
      return res.status(200).json({
        success: true,
        data: result,
      });
    } else {
      return res.status(404).json({
        success: false,
        message: result.message,
      });
    }
  } catch (error) {
    console.error('Get driver location error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get driver location',
    });
  }
};

// Get available car types
export const getAvailableCarTypesController = async (req, res) => {
  try {
    const { pickupLocation } = req.body;

    const result = await getAvailableCarTypes(pickupLocation);

    if (result.success) {
      return res.status(200).json({
        success: true,
        data: result.carTypes,
      });
    } else {
      return res.status(400).json({
        success: false,
        message: result.message,
      });
    }
  } catch (error) {
    console.error('Get available car types error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get available car types',
    });
  }
};

// Get ride history
export const getRideHistoryController = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page, limit, status } = req.query;

    const options = {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 10,
      ...(status && { status }),
    };

    const result = await getRideHistory(userId, options);

    if (result.success) {
      return res.status(200).json({
        success: true,
        data: {
          rides: result.rides,
          pagination: {
            page: options.page,
            limit: options.limit,
            total: result.rides.length,
          },
        },
      });
    } else {
      return res.status(400).json({
        success: false,
        message: result.message,
      });
    }
  } catch (error) {
    console.error('Get ride history error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get ride history',
    });
  }
};

// Get user ride statistics
export const getUserRideStatsController = async (req, res) => {
  try {
    const userId = req.user.id;
    const { startDate, endDate } = req.query;

    const result = await getUserRideStats(userId, startDate, endDate);

    if (result.success) {
      return res.status(200).json({
        success: true,
        data: result.stats,
      });
    } else {
      return res.status(400).json({
        success: false,
        message: result.message,
      });
    }
  } catch (error) {
    console.error('Get user ride stats error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get ride statistics',
    });
  }
};

// Validate promo code
export const validatePromoCodeController = async (req, res) => {
  try {
    const { promoCode, estimatedFare } = req.body;

    const validPromo = await validatePromoCode(promoCode);

    if (validPromo) {
      const discount = (estimatedFare * validPromo.discount) / 100;
      const finalAmount = Math.max(0, estimatedFare - discount);

      return res.status(200).json({
        success: true,
        data: {
          valid: true,
          promoCode: validPromo.code,
          discount: validPromo.discount,
          discountAmount: discount,
          originalFare: estimatedFare,
          finalFare: finalAmount,
          savings: discount,
        },
      });
    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired promo code',
      });
    }
  } catch (error) {
    console.error('Validate promo code error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to validate promo code',
    });
  }
};

// Driver Controllers

// Update driver location
export const updateDriverLocationController = async (req, res) => {
  try {
    const userId = req.user.id;
    const driver = await findDriverByUserId(userId);

    const locationData = req.body;

    const result = await updateDriverLocation(driver._id, locationData);

    if (result.success) {
      return res.status(200).json({
        success: true,
        data: result.location,
      });
    } else {
      return res.status(400).json({
        success: false,
        message: result.message,
      });
    }
  } catch (error) {
    console.error('Update driver location error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update location',
    });
  }
};

// Start ride (driver)
export const startRideController = async (req, res) => {
  try {
    const { rideId } = req.params;
    const userId = req.user.id;

    const driver = await findDriverByUserId(userId);
    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'Driver not found',
      });
    }

    const result = await startRide(rideId, driver._id);

    if (result.success) {
      return res.status(200).json({
        success: true,
        message: result.message,
        data: result.ride,
      });
    } else {
      return res.status(400).json({
        success: false,
        message: result.message,
      });
    }
  } catch (error) {
    console.error('Start ride error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to start ride',
    });
  }
};

// Complete ride (driver)
export const completeRideController = async (req, res) => {
  try {
    const { rideId } = req.params;
    const userId = req.user.id;
    const completionData = req.body;

    const driver = await findDriverByUserId(userId);
    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'Driver not found',
      });
    }

    const result = await completeRide(rideId, driver._id, completionData);

    if (result.success) {
      return res.status(200).json({
        success: true,
        message: result.message,
        data: {
          ride: result.ride,
          fareBreakdown: result.fareBreakdown,
        },
      });
    } else {
      return res.status(400).json({
        success: false,
        message: result.message,
      });
    }
  } catch (error) {
    console.error('Complete ride error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to complete ride',
    });
  }
};

// Update ride status (driver)
export const updateRideStatusController = async (req, res) => {
  try {
    const { rideId } = req.params;
    const { status, notes } = req.body;

    const result = await updateRideStatus(rideId, status, { notes });

    if (result.success) {
      return res.status(200).json({
        success: true,
        data: result.ride,
      });
    } else {
      return res.status(400).json({
        success: false,
        message: result.message,
      });
    }
  } catch (error) {
    console.error('Update ride status error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update ride status',
    });
  }
};

// Payment Controllers

// Process ride payment
export const processPaymentController = async (req, res) => {
  try {
    const { rideId } = req.params;

    const result = await processRidePayment(rideId);

    if (result.success) {
      return res.status(200).json({
        success: true,
        message: result.message,
        data: result.payment,
      });
    } else {
      return res.status(400).json({
        success: false,
        message: result.message,
        payment: result.payment,
      });
    }
  } catch (error) {
    console.error('Process payment error:', error);
    return res.status(500).json({
      success: false,
      message: 'Payment processing failed',
    });
  }
};

// Get payment methods
export const getPaymentMethodsController = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await getUserPaymentMethods(userId);

    if (result.success) {
      return res.status(200).json({
        success: true,
        data: result.paymentMethods,
      });
    } else {
      return res.status(400).json({
        success: false,
        message: result.message,
      });
    }
  } catch (error) {
    console.error('Get payment methods error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get payment methods',
    });
  }
};

// Get ride cost breakdown
export const getRideCostBreakdownController = async (req, res) => {
  try {
    const { rideId } = req.params;

    const result = await getRideCostBreakdown(rideId);

    if (result.success) {
      return res.status(200).json({
        success: true,
        data: result.costBreakdown,
      });
    } else {
      return res.status(404).json({
        success: false,
        message: result.message,
      });
    }
  } catch (error) {
    console.error('Get ride cost breakdown error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get cost breakdown',
    });
  }
};

// Chat Controllers

// Get chat history for a ride
export const getChatHistoryController = async (req, res) => {
  try {
    const { rideId } = req.params;
    const { before, limit, includeDeleted } = req.query;
    const userId = req.user.id;

    // Verify user has access to this ride
    const { findRideByRideId } = await import('../../dal/ride.js');
    const ride = await findRideByRideId(rideId);

    if (!ride) {
      return res.status(404).json({
        success: false,
        message: 'Ride not found',
      });
    }

    // Check if user is participant in this ride
    const participants = [
      ride.passengerId?.userId?.toString(),
      ride.driverId?.userId?.toString(),
    ].filter(Boolean);

    if (!participants.includes(userId)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: Not a participant in this ride',
      });
    }

    const options = {
      before,
      limit: parseInt(limit) || 50,
      includeDeleted: includeDeleted === 'true',
    };

    const messages = await getMessagesByRide(rideId, options);

    // Mark messages as delivered for this user
    try {
      const { markAllMessagesDelivered } = await import('../../dal/chat.js');
      await markAllMessagesDelivered(rideId, userId);
    } catch (error) {
      console.error('Failed to mark messages as delivered:', error);
    }

    return res.status(200).json({
      success: true,
      data: {
        messages,
        pagination: {
          limit: options.limit,
          hasMore: messages.length === options.limit,
        },
      },
    });
  } catch (error) {
    console.error('Get chat history error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get chat history',
    });
  }
};

// Mark all messages as read in a ride
export const markMessagesReadController = async (req, res) => {
  try {
    const { rideId } = req.params;
    const userId = req.user.id;

    // Verify user has access to this ride
    const { findRideByRideId } = await import('../../dal/ride.js');
    const ride = await findRideByRideId(rideId);

    if (!ride) {
      return res.status(404).json({
        success: false,
        message: 'Ride not found',
      });
    }

    // Check if user is participant in this ride
    const participants = [
      ride.passengerId?.userId?.toString(),
      ride.driverId?.userId?.toString(),
    ].filter(Boolean);

    if (!participants.includes(userId)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: Not a participant in this ride',
      });
    }

    const result = await markAllMessagesRead(rideId, userId);

    // Emit read receipt to other participants
    try {
      const { emitToRide } = await import('../../realtime/socket.js');
      emitToRide(rideId, 'chat:messages_read', {
        rideId,
        readBy: userId,
        readAt: new Date(),
        count: result.modifiedCount,
      });
    } catch (error) {
      console.error('Failed to emit read receipt:', error);
    }

    return res.status(200).json({
      success: true,
      data: {
        messagesRead: result.modifiedCount,
        readAt: new Date(),
      },
    });
  } catch (error) {
    console.error('Mark messages read error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to mark messages as read',
    });
  }
};

// Get chat statistics for a ride
export const getChatStatsController = async (req, res) => {
  try {
    const { rideId } = req.params;
    const userId = req.user.id;

    // Verify user has access to this ride
    const { findRideByRideId } = await import('../../dal/ride.js');
    const ride = await findRideByRideId(rideId);

    if (!ride) {
      return res.status(404).json({
        success: false,
        message: 'Ride not found',
      });
    }

    // Check if user is participant in this ride
    const participants = [
      ride.passengerId?.userId?.toString(),
      ride.driverId?.userId?.toString(),
    ].filter(Boolean);

    if (!participants.includes(userId)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: Not a participant in this ride',
      });
    }

    const [stats, unreadCount] = await Promise.all([
      getChatStats(rideId),
      getUnreadMessageCount(rideId, userId),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        ...stats,
        unreadCount,
      },
    });
  } catch (error) {
    console.error('Get chat stats error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get chat statistics',
    });
  }
};
