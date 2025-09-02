import express from 'express';
import { registerRoute } from '../../../utils/registerRoute.js';
import {
  getFareEstimateController,
  bookRideController,
  cancelRideController,
  getCurrentRideController,
  getRideStatusController,
  getDriverLocationController,
  getAvailableCarTypesController,
  getRideHistoryController,
  getUserRideStatsController,
  validatePromoCodeController,
  updateDriverLocationController,
  startRideController,
  completeRideController,
  updateRideStatusController,
  processPaymentController,
  getPaymentMethodsController,
  getRideCostBreakdownController,
  getChatHistoryController,
  markMessagesReadController,
  getChatStatsController
} from '../../../controllers/User/rideController.js';
import {
  fareEstimateValidation,
  rideBookingValidation,
  rideCancellationValidation,
  availableCarTypesValidation,
  driverLocationUpdateValidation,
  rideCompletionValidation,
  rideStatusUpdateValidation,
  rideHistoryValidation,
  rideStatsValidation,
  promoCodeValidation,
  rideIdValidation
} from '../../../validations/user/rideValidations.js';
import { authenticateUser } from '../../../middlewares/genericAuth.js';
import { authenticate as passengerAuth } from '../../../middlewares/passengerAuth.js';
import { driverAuthenticate } from '../../../middlewares/driverAuth.js';

const router = express.Router();

// Passenger Routes

// Get fare estimate
registerRoute({
  router,
  route: '/estimate-fare',
  post_middlewares: [authenticateUser],
  post_method: getFareEstimateController,
  validation: fareEstimateValidation,
});

// Book a ride
registerRoute({
  router,
  route: '/book',
  post_middlewares: [passengerAuth],
  post_method: bookRideController,
  validation: rideBookingValidation,
});

// Get available car types
registerRoute({
  router,
  route: '/available-cars',
  post_middlewares: [authenticateUser],
  post_method: getAvailableCarTypesController,
  validation: availableCarTypesValidation,
});

// Validate promo code
registerRoute({
  router,
  route: '/validate-promo',
  post_middlewares: [authenticateUser],
  post_method: validatePromoCodeController,
  validation: promoCodeValidation,
});

// Get current ride
registerRoute({
  router,
  route: '/current',
  get_middlewares: [passengerAuth],
  get_method: getCurrentRideController,
});

// Get ride history
registerRoute({
  router,
  route: '/history',
  get_middlewares: [passengerAuth],
  get_method: getRideHistoryController,
  validation: rideHistoryValidation,
});

// Get ride statistics
registerRoute({
  router,
  route: '/stats',
  get_middlewares: [passengerAuth],
  get_method: getUserRideStatsController,
  validation: rideStatsValidation,
});

// Get payment methods
registerRoute({
  router,
  route: '/payment-methods',
  get_middlewares: [passengerAuth],
  get_method: getPaymentMethodsController,
});

// Ride-specific routes (with ride ID parameter)

// Get ride status
registerRoute({
  router,
  route: '/:rideId/status',
  get_middlewares: [authenticateUser],
  get_method: getRideStatusController,
});

// Get driver location for ride
registerRoute({
  router,
  route: '/:rideId/driver-location',
  get_middlewares: [passengerAuth],
  get_method: getDriverLocationController,
});

// Cancel ride
registerRoute({
  router,
  route: '/:rideId/cancel',
  put_middlewares: [passengerAuth],
  put_method: cancelRideController,
  validation: rideCancellationValidation,
});

// Get ride cost breakdown
registerRoute({
  router,
  route: '/:rideId/cost-breakdown',
  get_middlewares: [authenticateUser],
  get_method: getRideCostBreakdownController,
});

// Process payment
registerRoute({
  router,
  route: '/:rideId/process-payment',
  post_middlewares: [authenticateUser],
  post_method: processPaymentController,
});

// Driver Routes

// Update driver location
registerRoute({
  router,
  route: '/driver/location',
  put_middlewares: [driverAuthenticate],
  put_method: updateDriverLocationController,
  validation: driverLocationUpdateValidation,
});

// Start ride (driver)
registerRoute({
  router,
  route: '/:rideId/start',
  put_middlewares: [driverAuthenticate],
  put_method:      startRideController,
});

// Complete ride (driver)
registerRoute({
  router,
  route: '/:rideId/complete',
  put_middlewares: [driverAuthenticate],
  put_method: completeRideController,
  validation: rideCompletionValidation,
});

// Update ride status (driver)
registerRoute({
  router,
  route: '/:rideId/status',
  put_middlewares: [driverAuthenticate],
  put_method: updateRideStatusController,
  validation: rideStatusUpdateValidation,
});

// Chat Routes

// Get chat history for a ride
registerRoute({
  router,
  route: '/:rideId/chat',
  get_middlewares: [authenticateUser],
  get_method: getChatHistoryController,
});

// Mark all messages as read in a ride
registerRoute({
  router,
  route: '/:rideId/chat/read',
  post_middlewares: [authenticateUser],
  post_method: markMessagesReadController,
});

// Get chat statistics for a ride
registerRoute({
  router,
  route: '/:rideId/chat/stats',
  get_middlewares: [authenticateUser],
  get_method: getChatStatsController,
});

export default router;



