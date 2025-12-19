import express from 'express';
import {
  sendDriverReceiptEmail,
  sendPassengerReceiptEmail,
  previewReceiptEmail,
} from '../../controllers/Test/receiptEmailTestController.js';
import { generateRideReceipt } from '../../utils/receiptGenerator.js';

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

/**
 * GET /api/test/receipt-email/download
 * Download receipt PDF directly (no auth required for testing)
 * Query params: ?id={rideId}&type=passenger|driver
 * Example: /api/test/receipt-email/download?id=123456789&type=passenger
 */
router.get('/download', async (req, res) => {
  try {
    const { id, type = 'passenger' } = req.query;

    if (!id) {
      return res.status(400).json({
        code: 400,
        message: 'Ride ID is required. Use ?id={rideId}&type=passenger|driver',
      });
    }

    if (!['passenger', 'driver'].includes(type)) {
      return res.status(400).json({
        code: 400,
        message: 'Type must be either "passenger" or "driver"',
      });
    }

    console.log(`📄 [TEST] Downloading ${type} receipt for ride ${id}...`);

    const generated = await generateRideReceipt(id, type);

    if (!generated?.success) {
      console.error(`❌ [TEST] Failed to generate receipt:`, generated?.error);
      return res.status(400).json({
        code: 400,
        message: generated?.error || 'Failed to generate receipt',
      });
    }

    // Get the PDF buffer from the generated receipt
    const pdfBuffer = Buffer.from(generated.receipt.base64, 'base64');

    if (!pdfBuffer || pdfBuffer.length < 100) {
      return res.status(400).json({
        code: 400,
        message: 'Invalid PDF data',
      });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${generated.receipt.fileName || `receipt-${id}-${type}.pdf`}"`,
    );
    res.setHeader('Content-Length', pdfBuffer.length);

    res.send(pdfBuffer);
  } catch (error) {
    console.error(`❌ [TEST] Error downloading receipt:`, error);
    res.status(500).json({
      code: 500,
      message: error.message || 'Failed to download receipt',
    });
  }
});

export default router;






