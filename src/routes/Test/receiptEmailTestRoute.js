import express from 'express';
import {
  sendDriverReceiptEmail,
  sendPassengerReceiptEmail,
  previewReceiptEmail,
} from '../../controllers/Test/receiptEmailTestController.js';

const router = express.Router();

/**
 * POST /api/test/receipt-email/send-driver-receipt
 * Send driver receipt email with PDF attachment
 * Body: { rideId: string, email?: string }
 */
router.post('/send-driver-receipt', sendDriverReceiptEmail);

/**
 * POST /api/test/receipt-email/send-passenger-receipt
 * Send passenger receipt email with PDF attachment
 * Body: { rideId: string, email?: string }
 */
router.post('/send-passenger-receipt', sendPassengerReceiptEmail);

/**
 * POST /api/test/receipt-email/preview
 * Preview receipt email content without sending
 * Body: { rideId: string, receiptType?: 'driver' | 'passenger' }
 */
router.post('/preview', previewReceiptEmail);

export default router;





