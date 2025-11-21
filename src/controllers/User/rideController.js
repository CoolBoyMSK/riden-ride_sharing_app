import {
  getFareEstimate,
  bookRide,
  getAvailableCarTypes,
} from '../../services/User/ride/rideBookingService.js';

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
      });
    } else {
      return res.status(400).json({
        success: false,
        message: result.message,
        activeRide: result.activeRide,
      });
    }
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    return res.status(500).json({
      success: false,
      message: error.message || 'Something went wrong',
    });
  }
};

// Get available car types
export const getAvailableCarTypesController = async (req, res) => {
  try {
    const result = await getAvailableCarTypes();

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
