import express from 'express';
import { registerRoute } from '../../../utils/registerRoute.js';
import {
  getFareEstimateController,
  bookRideController,
  getAvailableCarTypesController,
} from '../../../controllers/User/rideController.js';
import {
  fareEstimateValidation,
  rideBookingValidation,
  availableCarTypesValidation,
  promoCodeValidation,
} from '../../../validations/user/rideValidations.js';
import { authenticateUser } from '../../../middlewares/genericAuth.js';
import { authenticate as passengerAuth } from '../../../middlewares/passengerAuth.js';

const router = express.Router();

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

export default router;
