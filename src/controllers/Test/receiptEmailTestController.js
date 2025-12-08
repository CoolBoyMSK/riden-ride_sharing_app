import { generateRideReceipt } from '../../utils/receiptGenerator.js';
import emailTransporter from '../../config/emailTransporter.js';
import env from '../../config/envConfig.js';

/**
 * Test endpoint to send receipt email to driver
 * POST /api/test/receipt-email/send-driver-receipt
 * Body: { rideId: string, email?: string }
 */
export const sendDriverReceiptEmail = async (req, res) => {
  try {
    const { rideId, email } = req.body;

    if (!rideId) {
      return res.status(400).json({
        success: false,
        message: 'Ride ID is required',
      });
    }

    // Generate driver receipt
    const receiptResult = await generateRideReceipt(rideId, 'driver');

    if (!receiptResult?.success) {
      return res.status(400).json({
        success: false,
        message: receiptResult?.error || 'Failed to generate receipt',
        error: receiptResult?.error,
      });
    }

    // Get PDF buffer
    const pdfBuffer = Buffer.from(receiptResult.receipt.base64, 'base64');
    const fileName = receiptResult.receipt.fileName || `receipt-${rideId}-driver.pdf`;

    // Email content
    const emailSubject = 'Your Ride Receipt - Driver';
    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .header {
            background-color: #ff161f;
            color: white;
            padding: 20px;
            text-align: center;
            border-radius: 5px 5px 0 0;
          }
          .content {
            background-color: #f8fafc;
            padding: 30px;
            border-radius: 0 0 5px 5px;
          }
          .message {
            margin-bottom: 20px;
          }
          .footer {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
            font-size: 12px;
            color: #6b7280;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>DRIVER RECEIPT</h1>
        </div>
        <div class="content">
          <div class="message">
            <p>Hello,</p>
            <p>Thank you for driving with us! Your ride receipt is attached to this email.</p>
            <p>Please find your receipt PDF attached below.</p>
          </div>
          <div class="footer">
            <p>This is an electronically generated receipt. No signature is required.</p>
            <p>For any questions, please contact our support team.</p>
            <p>Generated on: ${new Date().toLocaleDateString()}</p>
          </div>
        </div>
      </body>
      </html>
    `;

    // Send email with PDF attachment
    const mailOptions = {
      from: `"Riden App" <${env.EMAIL_FROM}>`,
      to: email || 'test@example.com', // Use provided email or default test email
      subject: emailSubject,
      html: emailHtml,
      attachments: [
        {
          filename: fileName,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    };

    let emailSent = false;
    let emailError = null;

    try {
      const emailResult = await emailTransporter.sendMail(mailOptions);
      emailSent = true;
      console.log(`✅ Receipt email sent to ${mailOptions.to}:`, emailResult.messageId);
    } catch (emailErr) {
      emailError = emailErr.message;
      console.error(`❌ Failed to send receipt email:`, emailErr);
    }

    return res.status(200).json({
      success: true,
      message: emailSent
        ? 'Driver receipt email sent successfully'
        : 'Receipt generated but email failed to send',
      data: {
        receipt: {
          id: receiptResult.receipt.id,
          fileName: fileName,
          fileSize: pdfBuffer.length,
          base64: receiptResult.receipt.base64.substring(0, 100) + '...', // Truncated for response
        },
        email: {
          sent: emailSent,
          to: mailOptions.to,
          subject: emailSubject,
          error: emailError,
          htmlContent: emailHtml, // Return HTML for testing in Postman
        },
      },
    });
  } catch (error) {
    console.error('Error sending driver receipt email:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to send driver receipt email',
      error: error.message,
    });
  }
};

/**
 * Test endpoint to send receipt email to passenger
 * POST /api/test/receipt-email/send-passenger-receipt
 * Body: { rideId: string, email?: string }
 */
export const sendPassengerReceiptEmail = async (req, res) => {
  try {
    const { rideId, email } = req.body;

    if (!rideId) {
      return res.status(400).json({
        success: false,
        message: 'Ride ID is required',
      });
    }

    // Generate passenger receipt
    const receiptResult = await generateRideReceipt(rideId, 'passenger');

    if (!receiptResult?.success) {
      return res.status(400).json({
        success: false,
        message: receiptResult?.error || 'Failed to generate receipt',
        error: receiptResult?.error,
      });
    }

    // Get PDF buffer
    const pdfBuffer = Buffer.from(receiptResult.receipt.base64, 'base64');
    const fileName = receiptResult.receipt.fileName || `receipt-${rideId}-passenger.pdf`;

    // Email content
    const emailSubject = 'Your Ride Receipt - Passenger';
    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .header {
            background-color: #ff161f;
            color: white;
            padding: 20px;
            text-align: center;
            border-radius: 5px 5px 0 0;
          }
          .content {
            background-color: #f8fafc;
            padding: 30px;
            border-radius: 0 0 5px 5px;
          }
          .message {
            margin-bottom: 20px;
          }
          .footer {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
            font-size: 12px;
            color: #6b7280;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>PASSENGER RECEIPT</h1>
        </div>
        <div class="content">
          <div class="message">
            <p>Hello,</p>
            <p>Thank you for choosing our service! Your ride receipt is attached to this email.</p>
            <p>Please find your receipt PDF attached below.</p>
          </div>
          <div class="footer">
            <p>This is an electronically generated receipt. No signature is required.</p>
            <p>For any questions, please contact our support team.</p>
            <p>Generated on: ${new Date().toLocaleDateString()}</p>
          </div>
        </div>
      </body>
      </html>
    `;

    // Send email with PDF attachment
    const mailOptions = {
      from: `"Riden App" <${env.EMAIL_FROM}>`,
      to: email || 'test@example.com', // Use provided email or default test email
      subject: emailSubject,
      html: emailHtml,
      attachments: [
        {
          filename: fileName,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    };

    let emailSent = false;
    let emailError = null;

    try {
      const emailResult = await emailTransporter.sendMail(mailOptions);
      emailSent = true;
      console.log(`✅ Receipt email sent to ${mailOptions.to}:`, emailResult.messageId);
    } catch (emailErr) {
      emailError = emailErr.message;
      console.error(`❌ Failed to send receipt email:`, emailErr);
    }

    return res.status(200).json({
      success: true,
      message: emailSent
        ? 'Passenger receipt email sent successfully'
        : 'Receipt generated but email failed to send',
      data: {
        receipt: {
          id: receiptResult.receipt.id,
          fileName: fileName,
          fileSize: pdfBuffer.length,
          base64: receiptResult.receipt.base64.substring(0, 100) + '...', // Truncated for response
        },
        email: {
          sent: emailSent,
          to: mailOptions.to,
          subject: emailSubject,
          error: emailError,
          htmlContent: emailHtml, // Return HTML for testing in Postman
        },
      },
    });
  } catch (error) {
    console.error('Error sending passenger receipt email:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to send passenger receipt email',
      error: error.message,
    });
  }
};

/**
 * Test endpoint to preview receipt email content (without sending)
 * POST /api/test/receipt-email/preview
 * Body: { rideId: string, receiptType: 'driver' | 'passenger' }
 */
export const previewReceiptEmail = async (req, res) => {
  try {
    const { rideId, receiptType = 'passenger' } = req.body;

    if (!rideId) {
      return res.status(400).json({
        success: false,
        message: 'Ride ID is required',
      });
    }

    if (!['driver', 'passenger'].includes(receiptType)) {
      return res.status(400).json({
        success: false,
        message: "Receipt type must be 'driver' or 'passenger'",
      });
    }

    // Generate receipt
    const receiptResult = await generateRideReceipt(rideId, receiptType);

    if (!receiptResult?.success) {
      return res.status(400).json({
        success: false,
        message: receiptResult?.error || 'Failed to generate receipt',
        error: receiptResult?.error,
      });
    }

    // Get PDF buffer
    const pdfBuffer = Buffer.from(receiptResult.receipt.base64, 'base64');
    const fileName = receiptResult.receipt.fileName;

    // Email content based on type
    const isDriver = receiptType === 'driver';
    const emailSubject = isDriver ? 'Your Ride Receipt - Driver' : 'Your Ride Receipt - Passenger';
    const headerTitle = isDriver ? 'DRIVER RECEIPT' : 'PASSENGER RECEIPT';
    const greeting = isDriver
      ? 'Thank you for driving with us!'
      : 'Thank you for choosing our service!';

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .header {
            background-color: #ff161f;
            color: white;
            padding: 20px;
            text-align: center;
            border-radius: 5px 5px 0 0;
          }
          .content {
            background-color: #f8fafc;
            padding: 30px;
            border-radius: 0 0 5px 5px;
          }
          .message {
            margin-bottom: 20px;
          }
          .footer {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
            font-size: 12px;
            color: #6b7280;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>${headerTitle}</h1>
        </div>
        <div class="content">
          <div class="message">
            <p>Hello,</p>
            <p>${greeting} Your ride receipt is attached to this email.</p>
            <p>Please find your receipt PDF attached below.</p>
          </div>
          <div class="footer">
            <p>This is an electronically generated receipt. No signature is required.</p>
            <p>For any questions, please contact our support team.</p>
            <p>Generated on: ${new Date().toLocaleDateString()}</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return res.status(200).json({
      success: true,
      message: 'Receipt email preview generated successfully',
      data: {
        receipt: {
          id: receiptResult.receipt.id,
          fileName: fileName,
          fileSize: pdfBuffer.length,
          downloadUrl: receiptResult.receipt.downloadUrl,
        },
        email: {
          subject: emailSubject,
          htmlContent: emailHtml,
          preview: {
            // Extract text content for preview
            text: emailHtml
              .replace(/<[^>]*>/g, '')
              .replace(/\s+/g, ' ')
              .trim(),
          },
        },
      },
    });
  } catch (error) {
    console.error('Error previewing receipt email:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to preview receipt email',
      error: error.message,
    });
  }
};

