import Stripe from 'stripe';
import env from '../../config/envConfig.js';

const stripe = new Stripe(env.STRIPE_SECRET_KEY);

/**
 * Test endpoint to create a simple payment intent
 * POST /api/test/stripe/create-payment-intent
 */
export const createTestPaymentIntent = async (req, res) => {
  try {
    const { amount, currency = 'usd', description, paymentMethodId } = req.body;

    if (!amount || amount < 1) {
      return res.status(400).json({
        success: false,
        message: 'Amount is required and must be at least 1',
      });
    }

    const paymentIntentData = {
      amount: Math.round(amount * 100), // Convert to cents
      currency: currency.toLowerCase(),
      description: description || 'Test payment',
      // Configure automatic payment methods to avoid redirects
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: 'never',
      },
      metadata: {
        test: 'true',
        createdBy: 'test_api',
      },
    };

    // If payment method ID is provided, attach it
    if (paymentMethodId) {
      paymentIntentData.payment_method = paymentMethodId;
      paymentIntentData.confirmation_method = 'manual';
      paymentIntentData.confirm = true;
      // If confirming immediately, disable automatic payment methods
      delete paymentIntentData.automatic_payment_methods;
    }

    const paymentIntent = await stripe.paymentIntents.create(paymentIntentData);

    return res.status(200).json({
      success: true,
      message: 'Payment intent created successfully',
      data: {
        id: paymentIntent.id,
        clientSecret: paymentIntent.client_secret,
        amount: paymentIntent.amount / 100,
        currency: paymentIntent.currency,
        status: paymentIntent.status,
        description: paymentIntent.description,
      },
    });
  } catch (error) {
    console.error('Stripe Error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to create payment intent',
      error: error.type || 'stripe_error',
    });
  }
};

/**
 * Test endpoint to confirm a payment intent
 * POST /api/test/stripe/confirm-payment
 */
export const confirmTestPayment = async (req, res) => {
  try {
    const { paymentIntentId, paymentMethodId } = req.body;

    if (!paymentIntentId) {
      return res.status(400).json({
        success: false,
        message: 'Payment intent ID is required',
      });
    }

    const confirmData = {};
    if (paymentMethodId) {
      confirmData.payment_method = paymentMethodId;
    }

    const paymentIntent = await stripe.paymentIntents.confirm(
      paymentIntentId,
      confirmData,
    );

    return res.status(200).json({
      success: true,
      message: 'Payment confirmed successfully',
      data: {
        id: paymentIntent.id,
        status: paymentIntent.status,
        amount: paymentIntent.amount / 100,
        currency: paymentIntent.currency,
      },
    });
  } catch (error) {
    console.error('Stripe Error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to confirm payment',
      error: error.type || 'stripe_error',
    });
  }
};

/**
 * Test endpoint to get payment intent status
 * GET /api/test/stripe/payment-status/:paymentIntentId
 */
export const getPaymentStatus = async (req, res) => {
  try {
    const { paymentIntentId } = req.params;

    if (!paymentIntentId) {
      return res.status(400).json({
        success: false,
        message: 'Payment intent ID is required',
      });
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    return res.status(200).json({
      success: true,
      message: 'Payment status retrieved successfully',
      data: {
        id: paymentIntent.id,
        status: paymentIntent.status,
        amount: paymentIntent.amount / 100,
        currency: paymentIntent.currency,
        description: paymentIntent.description,
        created: new Date(paymentIntent.created * 1000).toISOString(),
        metadata: paymentIntent.metadata,
      },
    });
  } catch (error) {
    console.error('Stripe Error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to get payment status',
      error: error.type || 'stripe_error',
    });
  }
};

/**
 * Test endpoint to cancel a payment intent
 * POST /api/test/stripe/cancel-payment
 */
export const cancelTestPayment = async (req, res) => {
  try {
    const { paymentIntentId } = req.body;

    if (!paymentIntentId) {
      return res.status(400).json({
        success: false,
        message: 'Payment intent ID is required',
      });
    }

    const paymentIntent = await stripe.paymentIntents.cancel(paymentIntentId);

    return res.status(200).json({
      success: true,
      message: 'Payment cancelled successfully',
      data: {
        id: paymentIntent.id,
        status: paymentIntent.status,
        amount: paymentIntent.amount / 100,
        currency: paymentIntent.currency,
      },
    });
  } catch (error) {
    console.error('Stripe Error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to cancel payment',
      error: error.type || 'stripe_error',
    });
  }
};

/**
 * Test endpoint to create a refund
 * POST /api/test/stripe/refund
 */
export const createTestRefund = async (req, res) => {
  try {
    const { paymentIntentId, amount, reason } = req.body;

    if (!paymentIntentId) {
      return res.status(400).json({
        success: false,
        message: 'Payment intent ID is required',
      });
    }

    const refundData = {
      payment_intent: paymentIntentId,
    };

    if (amount) {
      refundData.amount = Math.round(amount * 100); // Convert to cents
    }

    if (reason) {
      refundData.reason = reason; // 'duplicate', 'fraudulent', 'requested_by_customer'
    }

    const refund = await stripe.refunds.create(refundData);

    return res.status(200).json({
      success: true,
      message: 'Refund created successfully',
      data: {
        id: refund.id,
        amount: refund.amount / 100,
        currency: refund.currency,
        status: refund.status,
        reason: refund.reason,
        paymentIntentId: refund.payment_intent,
      },
    });
  } catch (error) {
    console.error('Stripe Error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to create refund',
      error: error.type || 'stripe_error',
    });
  }
};

/**
 * Test endpoint to create a payment method
 * POST /api/test/stripe/create-payment-method
 */
export const createTestPaymentMethod = async (req, res) => {
  try {
    const { type = 'card', card } = req.body;

    if (type === 'card' && !card) {
      return res.status(400).json({
        success: false,
        message: 'Card details are required for card payment method',
      });
    }

    const paymentMethodData = {
      type,
    };

    if (type === 'card' && card) {
      paymentMethodData.card = card;
    }

    const paymentMethod = await stripe.paymentMethods.create(paymentMethodData);

    return res.status(200).json({
      success: true,
      message: 'Payment method created successfully',
      data: {
        id: paymentMethod.id,
        type: paymentMethod.type,
        card: paymentMethod.card
          ? {
              brand: paymentMethod.card.brand,
              last4: paymentMethod.card.last4,
              exp_month: paymentMethod.card.exp_month,
              exp_year: paymentMethod.card.exp_year,
            }
          : null,
      },
    });
  } catch (error) {
    console.error('Stripe Error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to create payment method',
      error: error.type || 'stripe_error',
    });
  }
};

/**
 * Test endpoint to get all payment intents (for testing)
 * GET /api/test/stripe/payments
 */
export const getAllTestPayments = async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const paymentIntents = await stripe.paymentIntents.list({
      limit: parseInt(limit, 10),
    });

    return res.status(200).json({
      success: true,
      message: 'Payment intents retrieved successfully',
      data: paymentIntents.data.map((pi) => ({
        id: pi.id,
        status: pi.status,
        amount: pi.amount / 100,
        currency: pi.currency,
        description: pi.description,
        created: new Date(pi.created * 1000).toISOString(),
      })),
      hasMore: paymentIntents.has_more,
    });
  } catch (error) {
    console.error('Stripe Error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to get payment intents',
      error: error.type || 'stripe_error',
    });
  }
};
