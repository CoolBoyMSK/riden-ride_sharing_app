import express from 'express';
import {
  createTestPaymentIntent,
  confirmTestPayment,
  getPaymentStatus,
  cancelTestPayment,
  createTestRefund,
  createTestPaymentMethod,
  getAllTestPayments,
  getAllTestTransactions,
  getTestTransaction,
} from '../../controllers/Test/stripeTestController.js';

const router = express.Router();

// Create payment intent
router.post('/create-payment-intent', createTestPaymentIntent);

// Confirm payment
router.post('/confirm-payment', confirmTestPayment);

// Get payment status
router.get('/payment-status/:paymentIntentId', getPaymentStatus);

// Cancel payment
router.post('/cancel-payment', cancelTestPayment);

// Create refund
router.post('/refund', createTestRefund);

// Create payment method
router.post('/create-payment-method', createTestPaymentMethod);

// Get all payment intents (for testing)
router.get('/payments', getAllTestPayments);

// Get all test transactions from database
router.get('/transactions', getAllTestTransactions);

// Get a single test transaction by ID
router.get('/transactions/:transactionId', getTestTransaction);

export default router;
