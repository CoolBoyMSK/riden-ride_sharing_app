import { 
  findRideByRideId, 
  updateRideByRideId 
} from '../../../dal/ride.js';

// Simulate payment processing (replace with actual payment gateway integration)
const processCardPayment = async (amount, cardToken) => {
  // Simulate API call to payment gateway (Stripe, PayPal, etc.)
  try {
    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Simulate random success/failure for demo
    const success = Math.random() > 0.1; // 90% success rate
    
    if (success) {
      return {
        success: true,
        transactionId: `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        amount,
        status: 'completed',
        processingFee: amount * 0.03 // 3% processing fee
      };
    } else {
      return {
        success: false,
        error: 'Payment declined by bank',
        status: 'failed'
      };
    }
  } catch (error) {
    return {
      success: false,
      error: 'Payment processing error',
      status: 'failed'
    };
  }
};

// Process wallet payment
const processWalletPayment = async (amount, walletId, userId) => {
  try {
    // In real implementation, you would:
    // 1. Check wallet balance
    // 2. Deduct amount from wallet
    // 3. Create transaction record
    
    // Simulate wallet balance check
    const walletBalance = 1000; // Mock balance
    
    if (walletBalance < amount) {
      return {
        success: false,
        error: 'Insufficient wallet balance',
        status: 'failed',
        availableBalance: walletBalance
      };
    }
    
    // Simulate wallet deduction
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    return {
      success: true,
      transactionId: `wallet_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      amount,
      status: 'completed',
      remainingBalance: walletBalance - amount
    };
    
  } catch (error) {
    return {
      success: false,
      error: 'Wallet payment error',
      status: 'failed'
    };
  }
};

// Process cash payment (mark as paid)
const processCashPayment = async (amount) => {
  return {
    success: true,
    transactionId: `cash_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    amount,
    status: 'completed',
    note: 'Cash payment confirmed by driver'
  };
};

// Main payment processing function
export const processRidePayment = async (rideId) => {
  try {
    const ride = await findRideByRideId(rideId);
    if (!ride) {
      return {
        success: false,
        message: 'Ride not found'
      };
    }
    
    if (ride.status !== 'RIDE_COMPLETED') {
      return {
        success: false,
        message: 'Cannot process payment. Ride is not completed.'
      };
    }
    
    if (ride.paymentStatus === 'COMPLETED') {
      return {
        success: false,
        message: 'Payment already processed for this ride'
      };
    }
    
    const amount = ride.fareBreakdown?.finalAmount || ride.actualFare || ride.estimatedFare;
    
    // Update payment status to processing
    await updateRideByRideId(rideId, {
      paymentStatus: 'PROCESSING'
    });
    
    let paymentResult;
    
    // Process payment based on method
    switch (ride.paymentMethod) {
      case 'card':
        // Get card token from passenger payment methods
        const cardDetails = ride.passengerId.paymentMethods?.find(pm => pm.type === 'card');
        if (!cardDetails?.details?.cardToken) {
          throw new Error('Card token not found');
        }
        paymentResult = await processCardPayment(amount, cardDetails.details.cardToken);
        break;
        
      case 'wallet':
        // Get wallet ID from passenger payment methods
        const walletDetails = ride.passengerId.paymentMethods?.find(pm => pm.type === 'wallet');
        if (!walletDetails?.details?.walletId) {
          throw new Error('Wallet ID not found');
        }
        paymentResult = await processWalletPayment(
          amount, 
          walletDetails.details.walletId, 
          ride.passengerId.userId
        );
        break;
        
      case 'cash':
        paymentResult = await processCashPayment(amount);
        break;
        
      default:
        throw new Error('Invalid payment method');
    }
    
    // Update ride with payment result
    const paymentStatus = paymentResult.success ? 'COMPLETED' : 'FAILED';
    const updatedRide = await updateRideByRideId(rideId, {
      paymentStatus,
      paymentTransactionId: paymentResult.transactionId,
      paymentProcessedAt: new Date()
    });
    
    if (paymentResult.success) {
      return {
        success: true,
        message: 'Payment processed successfully',
        payment: {
          transactionId: paymentResult.transactionId,
          amount,
          method: ride.paymentMethod,
          status: 'completed',
          processingFee: paymentResult.processingFee,
          remainingBalance: paymentResult.remainingBalance
        },
        ride: updatedRide
      };
    } else {
      return {
        success: false,
        message: `Payment failed: ${paymentResult.error}`,
        payment: {
          status: 'failed',
          error: paymentResult.error,
          amount,
          method: ride.paymentMethod
        }
      };
    }
    
  } catch (error) {
    // Update payment status to failed
    await updateRideByRideId(rideId, {
      paymentStatus: 'FAILED'
    });
    
    return {
      success: false,
      message: 'Payment processing failed',
      error: error.message
    };
  }
};

// Refund payment (for cancelled rides)
export const refundPayment = async (rideId, refundReason = 'Ride cancelled') => {
  try {
    const ride = await findRideByRideId(rideId);
    if (!ride) {
      return {
        success: false,
        message: 'Ride not found'
      };
    }
    
    if (!ride.paymentTransactionId) {
      return {
        success: false,
        message: 'No payment found to refund'
      };
    }
    
    if (ride.paymentStatus === 'REFUNDED') {
      return {
        success: false,
        message: 'Payment already refunded'
      };
    }
    
    // Simulate refund processing
    const refundResult = await processRefund(
      ride.paymentTransactionId, 
      ride.actualFare || ride.estimatedFare,
      ride.paymentMethod
    );
    
    if (refundResult.success) {
      await updateRideByRideId(rideId, {
        paymentStatus: 'REFUNDED',
        refundTransactionId: refundResult.refundId,
        refundProcessedAt: new Date(),
        refundReason
      });
      
      return {
        success: true,
        message: 'Refund processed successfully',
        refund: refundResult
      };
    } else {
      return {
        success: false,
        message: `Refund failed: ${refundResult.error}`
      };
    }
    
  } catch (error) {
    return {
      success: false,
      message: 'Refund processing failed',
      error: error.message
    };
  }
};

// Simulate refund processing
const processRefund = async (originalTransactionId, amount, paymentMethod) => {
  try {
    // Simulate refund processing delay
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Simulate refund success (95% success rate)
    const success = Math.random() > 0.05;
    
    if (success) {
      return {
        success: true,
        refundId: `refund_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        originalTransactionId,
        amount,
        status: 'completed',
        estimatedArrival: paymentMethod === 'card' ? '3-5 business days' : 'immediate'
      };
    } else {
      return {
        success: false,
        error: 'Refund processing failed',
        status: 'failed'
      };
    }
  } catch (error) {
    return {
      success: false,
      error: 'Refund service unavailable',
      status: 'failed'
    };
  }
};

// Get payment methods for user
export const getUserPaymentMethods = async (userId) => {
  try {
    const { findPassengerByUserId } = await import('../../../dal/passenger.js');
    const passenger = await findPassengerByUserId(userId);
    
    if (!passenger) {
      return {
        success: false,
        message: 'Passenger profile not found'
      };
    }
    
    return {
      success: true,
      paymentMethods: passenger.paymentMethods.map(pm => ({
        type: pm.type,
        isDefault: pm.isDefault || false,
        // Don't expose sensitive details
        ...(pm.type === 'card' && { 
          cardLast4: pm.details?.cardToken?.slice(-4) || '****' 
        }),
        ...(pm.type === 'wallet' && { 
          walletProvider: pm.details?.provider || 'Digital Wallet' 
        })
      }))
    };
    
  } catch (error) {
    return {
      success: false,
      message: 'Failed to get payment methods',
      error: error.message
    };
  }
};

// Calculate ride cost breakdown
export const getRideCostBreakdown = async (rideId) => {
  try {
    const ride = await findRideByRideId(rideId);
    if (!ride) {
      return {
        success: false,
        message: 'Ride not found'
      };
    }
    
    return {
      success: true,
      costBreakdown: {
        baseFare: ride.fareBreakdown?.baseFare || 0,
        distanceFare: ride.fareBreakdown?.distanceFare || 0,
        timeFare: ride.fareBreakdown?.timeFare || 0,
        nightCharge: ride.fareBreakdown?.nightCharge || 0,
        peakCharge: ride.fareBreakdown?.peakCharge || 0,
        waitingCharge: ride.fareBreakdown?.waitingCharge || 0,
        subtotal: ride.fareBreakdown?.subtotal || 0,
        promoDiscount: ride.fareBreakdown?.promoDiscount || 0,
        finalAmount: ride.fareBreakdown?.finalAmount || ride.actualFare || ride.estimatedFare,
        currency: 'USD',
        promoCode: ride.promoCode?.isApplied ? ride.promoCode : null
      }
    };
    
  } catch (error) {
    return {
      success: false,
      message: 'Failed to get cost breakdown',
      error: error.message
    };
  }
};
