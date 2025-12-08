import PDFDocument from 'pdfkit';
import mongoose from 'mongoose';
import moment from 'moment';
import Ride from '../models/Ride.js';
import RideTransaction from '../models/RideTransaction.js';
import RideReceipt from '../models/RideReceipt.js';
import Commission from '../models/Commission.js';
import { findPassengerById } from '../dal/passenger.js';
import { findDriverById } from '../dal/driver.js';
import env from '../config/envConfig.js';

// Utility functions
const formatDate = (date) => {
  if (!date) return 'N/A';
  try {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return 'Invalid Date';
  }
};

const formatTime = (date) => {
  if (!date) return 'N/A';
  try {
    return new Date(date).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return 'Invalid Time';
  }
};

const formatDuration = (minutes) => {
  if (!minutes || isNaN(minutes)) return '0 min';
  return `${Math.floor(minutes)} ${minutes > 1 ? 'mins' : 'min'}`;
};

const formatCurrency = (amount) => {
  if (!amount || isNaN(amount)) return '$0.00';
  return `$${Math.max(0, parseFloat(amount)).toFixed(2)}`;
};

const safeSliceId = (id, length = 8) => {
  if (!id || !id.toString) return 'N/A';
  return id.toString().slice(-length);
};

// Fixed PDF generation function
const generatePDFBuffer = (ride, transaction, driver, passenger, receiptType = 'passenger') => {
  return new Promise((resolve, reject) => {
    try {
      // Create PDF document with proper configuration
      const receiptTitle = receiptType === 'driver' ? 'Driver Receipt' : 'Passenger Receipt';
      const doc = new PDFDocument({
        size: 'A4',
        margins: {
          top: 50,
          bottom: 50,
          left: 50,
          right: 50,
        },
        info: {
          Title: `${receiptTitle} - ${safeSliceId(ride._id)}`,
          Author: 'Ride Sharing Platform',
          Subject: 'Ride Receipt',
          Keywords: 'receipt, ride, payment',
          Creator: 'Ride Receipt System',
          Producer: 'PDFKit',
          CreationDate: new Date(),
        },
        autoFirstPage: true,
      });

      const chunks = [];

      // Collect PDF data
      doc.on('data', (chunk) => {
        chunks.push(chunk);
      });

      doc.on('end', () => {
        try {
          const buffer = Buffer.concat(chunks);
          // Validate PDF buffer
          if (buffer && buffer.length > 100) {
            // PDF should be at least 100 bytes
            // Check if it starts with PDF header
            if (buffer.slice(0, 4).toString() === '%PDF') {
              resolve(buffer);
            } else {
              reject(new Error('Generated file is not a valid PDF'));
            }
          } else {
            reject(new Error('Generated PDF buffer is too small or empty'));
          }
        } catch (bufferError) {
          reject(
            new Error(`Buffer concatenation failed: ${bufferError.message}`),
          );
        }
      });

      doc.on('error', (error) => {
        console.error('PDF stream error:', error);
        reject(new Error(`PDF generation stream error: ${error.message}`));
      });

      // Generate content based on receipt type
      if (receiptType === 'driver') {
        generateDriverReceiptContent(doc, ride, transaction, driver, passenger);
      } else {
        generatePassengerReceiptContent(doc, ride, transaction, driver, passenger);
      }

      // Finalize PDF
      doc.end();
    } catch (error) {
      console.error('PDF setup error:', error);
      reject(new Error(`PDF document creation failed: ${error.message}`));
    }
  });
};

// Passenger receipt content generation
const generatePassengerReceiptContent = (doc, ride, transaction, driver, passenger) => {
  try {
    // Set default font at the beginning
    doc.font('Helvetica');

    // Colors
    const primaryColor = '#ff161f';
    const secondaryColor = '#6b7280';
    const borderColor = '#e5e7eb';
    const backgroundColor = '#f8fafc';

    // Header Section
    doc
      .fontSize(20)
      .fillColor(primaryColor)
      .font('Helvetica-Bold')
      .text('PASSENGER RECEIPT', 50, 50, { align: 'center' });

    doc
      .fontSize(10)
      .fillColor(secondaryColor)
      .font('Helvetica')
      .text('Thank you for choosing our service!', 50, 75, { align: 'center' });

    // Separator line
    doc
      .strokeColor(borderColor)
      .lineWidth(1)
      .moveTo(50, 95)
      .lineTo(545, 95)
      .stroke();

    // All info sections in one row
    const rowStartY = 120;
    const rowHeaderY = rowStartY;
    const rowContentY = rowStartY + 20;

    // Ride Information Section (Left Column)
    doc
      .fontSize(12)
      .fillColor('#000000')
      .font('Helvetica-Bold')
      .text('RIDE INFORMATION', 50, rowHeaderY);

    doc
      .fontSize(10)
      .fillColor(secondaryColor)
      .font('Helvetica')
      .text(`Receipt #: ${safeSliceId(ride._id)}`, 50, rowContentY, { lineBreak: false });
    doc.text(`Date: ${formatDate(ride.createdAt)}`, 50, rowContentY + 15, { lineBreak: false });
    doc.text(`Time: ${formatTime(ride.createdAt)}`, 50, rowContentY + 30, { lineBreak: false });
    doc.text(`Duration: ${formatDuration(ride.actualDuration)}`, 50, rowContentY + 45, { lineBreak: false });

    // Driver Information Section (Middle Column)
    const driverInfoX = 220; // Middle position
    
    doc
      .fontSize(12)
      .fillColor('#000000')
      .font('Helvetica-Bold')
      .text('DRIVER INFORMATION', driverInfoX, rowHeaderY);

    doc
      .fontSize(10)
      .fillColor(secondaryColor)
      .font('Helvetica');
    
    doc.text(`Driver Id: ${driver.uniqueId || 'N/A'}`, driverInfoX, rowContentY, { lineBreak: false });
    doc.text(`Name: ${driver.userId?.name || 'N/A'}`, driverInfoX, rowContentY + 15, { lineBreak: false });
    doc.text(`Vehicle: ${driver.vehicle?.type || 'N/A'}`, driverInfoX, rowContentY + 30, { lineBreak: false });

    // Passenger Information Section (Right Column)
    const passengerInfoX = 380; // Right position
    
    doc
      .fontSize(12)
      .fillColor('#000000')
      .font('Helvetica-Bold')
      .text('PASSENGER INFORMATION', passengerInfoX, rowHeaderY);

    doc
      .fontSize(10)
      .fillColor(secondaryColor)
      .font('Helvetica');
    
    doc.text(`Passenger Id: ${passenger.uniqueId || 'N/A'}`, passengerInfoX, rowContentY, { lineBreak: false });
    doc.text(`Name: ${passenger.userId?.name || 'N/A'}`, passengerInfoX, rowContentY + 15, { lineBreak: false });
    doc.text(`Email: ${passenger.userId?.email || 'N/A'}`, passengerInfoX, rowContentY + 30, { lineBreak: false });

    let yPosition = rowStartY + 90; // Start next section below the info row

    yPosition = 200;

    // Trip Route
    doc
      .fontSize(12)
      .fillColor('#000000')
      .font('Helvetica-Bold')
      .text('TRIP ROUTE', 50, yPosition);

    yPosition += 25;

    // Pickup Location
    doc
      .fillColor(primaryColor)
      .text('•', 50, yPosition)
      .fillColor(secondaryColor)
      .fontSize(10)
      .text(` Pickup: ${formatTime(ride.rideStartedAt || 'N/A')}`, 65, yPosition, { lineBreak: false });
    
    doc
      .fillColor(secondaryColor)
      .fontSize(10)
      .text(
        ride.pickupLocation?.address || 'Location not specified',
        65,
        yPosition + 15,
      );

    yPosition += 40;

    // Dropoff Location
    doc
      .fillColor(primaryColor)
      .text('•', 50, yPosition)
      .fillColor(secondaryColor)
      .fontSize(10)
      .text(` Dropoff: ${formatTime(ride.rideCompletedAt || 'N/A')}`, 65, yPosition, { lineBreak: false });
    
    doc
      .fillColor(secondaryColor)
      .fontSize(10)
      .text(
        ride.dropoffLocation?.address || 'Location not specified',
        65,
        yPosition + 15,
      );

    yPosition += 35; // Reduced from 60 to 35 to bring box closer

    // Trip Summary Box
    doc
      .roundedRect(50, yPosition, 495, 70, 5)
      .fill(backgroundColor)
      .stroke(borderColor);

    doc
      .fillColor('#000000')
      .font('Helvetica-Bold')
      .text('TRIP SUMMARY', 70, yPosition + 15);

    doc
      .fillColor(secondaryColor)
      .font('Helvetica')
      .fontSize(10);
    
    // First row: Distance, Payment, Duration
    doc.text(
      `Distance: ${(ride.actualDistance || 0).toFixed(2)} km`,
      70,
      yPosition + 35,
      { lineBreak: false }
    );
    doc.text(
      `Payment: ${ride.paymentMethod || 'N/A'}`,
      250,
      yPosition + 35,
      { lineBreak: false }
    );
    doc.text(
      `Duration: ${formatDuration(ride.actualDuration)}`,
      400,
      yPosition + 35,
      { lineBreak: false }
    );
    
    // Second row: Transaction, Waiting
    doc.text(
      `Transaction: ${safeSliceId(transaction._id)}`,
      70,
      yPosition + 50,
      { lineBreak: false }
    );
    doc.text(
      `Waiting: ${formatDuration(ride.actualWaitingTime)}`,
      250,
      yPosition + 50,
      { lineBreak: false }
    );

    yPosition += 90;

    // Fare Breakdown
    doc
      .fontSize(12)
      .fillColor('#000000')
      .font('Helvetica-Bold')
      .text('FARE BREAKDOWN', 50, yPosition);

    yPosition += 25;

    // Table Header
    doc
      .fontSize(10)
      .fillColor(secondaryColor)
      .text('Description', 50, yPosition)
      .text('Amount', 450, yPosition, { align: 'right' });

    yPosition += 15; // Move down after text
    
    // Draw line below the header text
    doc
      .strokeColor(borderColor)
      .lineWidth(0.5)
      .moveTo(50, yPosition)
      .lineTo(545, yPosition)
      .stroke();

    yPosition += 10; // Space after line before items

    // Passenger Receipt Items
    const fareBreakdown = ride.fareBreakdown || {};
    const tipBreakdown = ride.tipBreakdown || {};

    // Calculate subtotal (before discount and after surge)
    const subtotal = (fareBreakdown.rideSetupFee || 0) +
                     (fareBreakdown.baseFare || 0) +
                     (fareBreakdown.timeFare || 0) +
                     (fareBreakdown.distanceFare || 0) +
                     (fareBreakdown.waitingCharge || 0) +
                     (tipBreakdown.amount || 0);

    const items = [
      {
        label: 'Ride Setup Fee',
        amount: fareBreakdown.rideSetupFee || 0,
        type: 'income',
      },
      {
        label: 'Base Fare',
        amount: fareBreakdown.baseFare || 0,
        type: 'income',
      },
      {
        label: 'Time Fare',
        amount: fareBreakdown.timeFare || 0,
        type: 'income',
      },
      {
        label: 'Distance Fare',
        amount: fareBreakdown.distanceFare || 0,
        type: 'income',
      },
      {
        label: 'Waiting Charges',
        amount: fareBreakdown.waitingCharge || 0,
        type: 'income',
      },
      {
        label: 'Surge Multiplier',
        amount: fareBreakdown.surgeMultiplier || 1,
        type: 'multiplier',
      },
      {
        label: 'Tip',
        amount: tipBreakdown.amount || 0,
        type: 'income',
      },
      {
        label: 'Sub Total',
        amount: subtotal,
        type: 'subtotal',
      },
    ];

    // Add Discount (PROMOCODE) only if promo code was actually applied
    const hasPromoCode = ride.promoCode?.code && ride.promoCode?.isApplied === true;
    if (hasPromoCode) {
      const promoDiscount = (tipBreakdown.promoDiscount || 0) + (fareBreakdown.promoDiscount || 0);
      if (promoDiscount > 0) {
        // Get promo code name from ride object
        const promoCodeName = ride.promoCode.code;
        const discountLabel = `Discount Promo Code ${promoCodeName}`;
        
        items.push({
          label: discountLabel,
          amount: promoDiscount,
          type: 'deduction',
        });
      }
    }

    // Add Total Amount Paid
    items.push({
      label: 'Total Amount Paid',
      amount: fareBreakdown.finalAmount || 0,
      type: 'total',
    });

    // Add items to PDF
    items.forEach((item) => {
      const amount = parseFloat(item.amount) || 0;
      
      // Show all items, even if amount is 0 (except for optional items like discount)
      if (item.type === 'deduction' && amount === 0) {
        return; // Skip discount if it's 0
      }

      let amountText;
      
      // Special handling for Surge Multiplier - show as multiplier (x1.25) instead of currency
      if (item.type === 'multiplier') {
        amountText = `x${amount.toFixed(2)}`;
      } else if (item.type === 'subtotal' || item.type === 'total') {
        amountText = formatCurrency(amount);
      } else {
        amountText =
          item.type === 'deduction'
            ? `-${formatCurrency(amount)}`
            : formatCurrency(amount);
      }
      
      const color = item.type === 'deduction' ? '#ef4444' : 
                   (item.type === 'subtotal' || item.type === 'total') ? '#000000' : '#000000';
      const fontWeight = (item.type === 'subtotal' || item.type === 'total') ? 'Helvetica-Bold' : 'Helvetica';

      doc
        .font(fontWeight)
        .fillColor('#000000')
        .text(item.label, 50, yPosition)
        .fillColor(color)
        .text(amountText, 450, yPosition, { align: 'right' });

      yPosition += 15;
    });

    yPosition += 10;

    // Total Separator
    doc
      .strokeColor(borderColor)
      .lineWidth(1)
      .moveTo(50, yPosition)
      .lineTo(545, yPosition)
      .stroke();

    yPosition += 15;

    // Total Amount Paid (already shown in items, but show again for emphasis)
    const totalAmountPaid = parseFloat(fareBreakdown.finalAmount) || 0;
    doc
      .fontSize(12)
      .fillColor('#000000')
      .font('Helvetica-Bold')
      .text('TOTAL AMOUNT PAID', 50, yPosition)
      .text(`${formatCurrency(totalAmountPaid)} CAD`, 450, yPosition, {
        align: 'right',
      });

    yPosition += 40;

    // Footer
    doc
      .fontSize(8)
      .fillColor(secondaryColor)
      .text(
        'This is an electronically generated receipt. No signature is required.',
        50,
        yPosition,
        { align: 'center' },
      )
      .text(
        `Generated on: ${new Date().toLocaleDateString()}`,
        50,
        yPosition + 12,
        { align: 'center' },
      )
      .text(
        'For any questions, please contact our support team.',
        50,
        yPosition + 24,
        { align: 'center' },
      );
  } catch (error) {
    console.error('Error in PDF content generation:', error);
    // Add fallback content if main content fails
    doc
      .fontSize(16)
      .fillColor('#000000')
      .text('Passenger Receipt', 50, 50)
      .fontSize(10)
      .text(`Receipt ID: ${safeSliceId(ride._id)}`, 50, 80)
      .text('There was an error generating the full receipt details.', 50, 100);

    throw error;
  }
};

// Driver receipt content generation
const generateDriverReceiptContent = (doc, ride, transaction, driver, passenger) => {
  try {
    // Set default font at the beginning
    doc.font('Helvetica');

    // Colors
    const primaryColor = '#ff161f';
    const secondaryColor = '#6b7280';
    const borderColor = '#e5e7eb';
    const backgroundColor = '#f8fafc';

    // Header Section
    doc
      .fontSize(20)
      .fillColor(primaryColor)
      .font('Helvetica-Bold')
      .text('DRIVER RECEIPT', 50, 50, { align: 'center' });

    doc
      .fontSize(10)
      .fillColor(secondaryColor)
      .font('Helvetica')
      .text('Thank you for driving with us!', 50, 75, { align: 'center' });

    // Separator line
    doc
      .strokeColor(borderColor)
      .lineWidth(1)
      .moveTo(50, 95)
      .lineTo(545, 95)
      .stroke();

    // All info sections in one row
    const rowStartY = 120;
    const rowHeaderY = rowStartY;
    const rowContentY = rowStartY + 20;

    // Ride Information Section (Left Column)
    doc
      .fontSize(12)
      .fillColor('#000000')
      .font('Helvetica-Bold')
      .text('RIDE INFORMATION', 50, rowHeaderY);

    doc
      .fontSize(10)
      .fillColor(secondaryColor)
      .font('Helvetica')
      .text(`Receipt #: ${safeSliceId(ride._id)}`, 50, rowContentY, { lineBreak: false });
    doc.text(`Date: ${formatDate(ride.createdAt)}`, 50, rowContentY + 15, { lineBreak: false });
    doc.text(`Time: ${formatTime(ride.createdAt)}`, 50, rowContentY + 30, { lineBreak: false });
    doc.text(`Duration: ${formatDuration(ride.actualDuration)}`, 50, rowContentY + 45, { lineBreak: false });

    // Driver Information Section (Middle Column)
    const driverInfoX = 220; // Middle position
    
    doc
      .fontSize(12)
      .fillColor('#000000')
      .font('Helvetica-Bold')
      .text('DRIVER INFORMATION', driverInfoX, rowHeaderY);

    doc
      .fontSize(10)
      .fillColor(secondaryColor)
      .font('Helvetica');
    
    doc.text(`Driver Id: ${driver.uniqueId || 'N/A'}`, driverInfoX, rowContentY, { lineBreak: false });
    doc.text(`Name: ${driver.userId?.name || 'N/A'}`, driverInfoX, rowContentY + 15, { lineBreak: false });
    doc.text(`Vehicle: ${driver.vehicle?.type || 'N/A'}`, driverInfoX, rowContentY + 30, { lineBreak: false });

    // Passenger Information Section (Right Column)
    const passengerInfoX = 380; // Right position
    
    doc
      .fontSize(12)
      .fillColor('#000000')
      .font('Helvetica-Bold')
      .text('PASSENGER INFORMATION', passengerInfoX, rowHeaderY);

    doc
      .fontSize(10)
      .fillColor(secondaryColor)
      .font('Helvetica');
    
    doc.text(`Passenger Id: ${passenger.uniqueId || 'N/A'}`, passengerInfoX, rowContentY, { lineBreak: false });
    doc.text(`Name: ${passenger.userId?.name || 'N/A'}`, passengerInfoX, rowContentY + 15, { lineBreak: false });
    doc.text(`Email: ${passenger.userId?.email || 'N/A'}`, passengerInfoX, rowContentY + 30, { lineBreak: false });

    let yPosition = rowStartY + 90; // Start next section below the info row

    yPosition = 200;

    // Trip Route
    doc
      .fontSize(12)
      .fillColor('#000000')
      .font('Helvetica-Bold')
      .text('TRIP ROUTE', 50, yPosition);

    yPosition += 25;

    // Pickup Location
    doc
      .fillColor(primaryColor)
      .text('•', 50, yPosition)
      .fillColor(secondaryColor)
      .fontSize(10)
      .text(` Pickup: ${formatTime(ride.rideStartedAt || 'N/A')}`, 65, yPosition, { lineBreak: false });
    
    doc
      .fillColor(secondaryColor)
      .fontSize(10)
      .text(
        ride.pickupLocation?.address || 'Location not specified',
        65,
        yPosition + 15,
      );

    yPosition += 40;

    // Dropoff Location
    doc
      .fillColor(primaryColor)
      .text('•', 50, yPosition)
      .fillColor(secondaryColor)
      .fontSize(10)
      .text(` Dropoff: ${formatTime(ride.rideCompletedAt || 'N/A')}`, 65, yPosition, { lineBreak: false });
    
    doc
      .fillColor(secondaryColor)
      .fontSize(10)
      .text(
        ride.dropoffLocation?.address || 'Location not specified',
        65,
        yPosition + 15,
      );

    yPosition += 35; // Reduced from 60 to 35 to bring box closer

    // Trip Summary Box
    doc
      .roundedRect(50, yPosition, 495, 70, 5)
      .fill(backgroundColor)
      .stroke(borderColor);

    doc
      .fillColor('#000000')
      .font('Helvetica-Bold')
      .text('TRIP SUMMARY', 70, yPosition + 15);

    doc
      .fillColor(secondaryColor)
      .font('Helvetica')
      .fontSize(10);
    
    // First row: Distance, Payment, Duration
    doc.text(
      `Distance: ${(ride.actualDistance || 0).toFixed(2)} km`,
      70,
      yPosition + 35,
      { lineBreak: false }
    );
    doc.text(
      `Payment: ${ride.paymentMethod || 'N/A'}`,
      250,
      yPosition + 35,
      { lineBreak: false }
    );
    doc.text(
      `Duration: ${formatDuration(ride.actualDuration)}`,
      400,
      yPosition + 35,
      { lineBreak: false }
    );
    
    // Second row: Transaction, Waiting
    doc.text(
      `Transaction: ${safeSliceId(transaction._id)}`,
      70,
      yPosition + 50,
      { lineBreak: false }
    );
    doc.text(
      `Waiting: ${formatDuration(ride.actualWaitingTime)}`,
      250,
      yPosition + 50,
      { lineBreak: false }
    );

    yPosition += 90;

    // Earnings Breakdown
    doc
      .fontSize(12)
      .fillColor('#000000')
      .font('Helvetica-Bold')
      .text('EARNINGS BREAKDOWN', 50, yPosition);

    yPosition += 25;

    // Table Header
    doc
      .fontSize(10)
      .fillColor(secondaryColor)
      .text('Description', 50, yPosition)
      .text('Amount', 450, yPosition, { align: 'right' });

    yPosition += 15; // Move down after text
    
    // Draw line below the header text
    doc
      .strokeColor(borderColor)
      .lineWidth(0.5)
      .moveTo(50, yPosition)
      .lineTo(545, yPosition)
      .stroke();

    yPosition += 10; // Space after line before items

    // Driver Receipt Items
    const tipBreakdown = ride.tipBreakdown || {};
    const tip = tipBreakdown.amount || 0;
    // transaction.amount is the actual fare (total fare paid by passenger)
    // transaction.driverEarning is (actualFare - commission)
    // transaction.commission is the commission amount
    const actualFare = parseFloat(transaction.amount) || 0;
    const platformFee = parseFloat(transaction.commission) || 0;
    const bonus = 0; // Bonus from Riden - currently not stored, defaulting to 0
    // Ride Fee = actualFare (the total fare amount)
    const rideFee = actualFare;
    // Total Earned = Ride Fee + Tip + Bonus - Platform Fee
    const totalEarned = rideFee + tip + bonus - platformFee;

    const items = [
      {
        label: 'Ride Fee',
        amount: rideFee,
        type: 'income',
      },
      {
        label: 'Tip',
        amount: tip,
        type: 'income',
      },
      {
        label: 'Bonus from Riden',
        amount: bonus,
        type: 'income',
      },
      {
        label: 'Riden Platform Fee',
        amount: platformFee,
        type: 'deduction',
      },
    ];

    // Add items to PDF
    items.forEach((item) => {
      const amount = parseFloat(item.amount) || 0;
      
      // Show all items, even if amount is 0
      let amountText;
      
      if (item.type === 'deduction') {
        amountText = `-${formatCurrency(amount)}`;
      } else {
        amountText = formatCurrency(amount);
      }
      
      const color = item.type === 'deduction' ? '#ef4444' : '#000000';

      doc
        .fillColor('#000000')
        .text(item.label, 50, yPosition)
        .fillColor(color)
        .text(amountText, 450, yPosition, { align: 'right' });

      yPosition += 15;
    });

    yPosition += 10;

    // Total Separator
    doc
      .strokeColor(borderColor)
      .lineWidth(1)
      .moveTo(50, yPosition)
      .lineTo(545, yPosition)
      .stroke();

    yPosition += 15;

    // Total Earned
    doc
      .fontSize(12)
      .fillColor('#000000')
      .font('Helvetica-Bold')
      .text('TOTAL EARNED FROM THIS RIDE', 50, yPosition)
      .text(`${formatCurrency(totalEarned)} CAD`, 450, yPosition, {
        align: 'right',
      });

    yPosition += 40;

    // Footer
    doc
      .fontSize(8)
      .fillColor(secondaryColor)
      .text(
        'This is an electronically generated receipt. No signature is required.',
        50,
        yPosition,
        { align: 'center' },
      )
      .text(
        `Generated on: ${new Date().toLocaleDateString()}`,
        50,
        yPosition + 12,
        { align: 'center' },
      )
      .text(
        'For any questions, please contact our support team.',
        50,
        yPosition + 24,
        { align: 'center' },
      );
  } catch (error) {
    console.error('Error in PDF content generation:', error);
    // Add fallback content if main content fails
    doc
      .fontSize(16)
      .fillColor('#000000')
      .text('Driver Receipt', 50, 50)
      .fontSize(10)
      .text(`Receipt ID: ${safeSliceId(ride._id)}`, 50, 80)
      .text('There was an error generating the full receipt details.', 50, 100);

    throw error;
  }
};

// Updated main function with PDF validation
export const generateRideReceipt = async (bookingId, receiptType = 'passenger') => {
  try {
    // Validate input
    if (!bookingId || !mongoose.Types.ObjectId.isValid(bookingId)) {
      throw new Error('Invalid booking ID');
    }

    // First check if ride exists at all
    const rideExists = await Ride.findById(bookingId).select('status paymentStatus').lean();
    
    if (!rideExists) {
      throw new Error(`Ride not found with ID: ${bookingId}`);
    }

    // Check ride status - must be completed
    if (rideExists.status !== 'RIDE_COMPLETED') {
      throw new Error(
        `Cannot generate receipt. Ride status is '${rideExists.status}' but must be 'RIDE_COMPLETED'`,
      );
    }

    // Allow receipt generation for COMPLETED, PROCESSING, and PENDING payment status
    const allowedPaymentStatuses = ['COMPLETED', 'PROCESSING', 'PENDING'];
    if (!allowedPaymentStatuses.includes(rideExists.paymentStatus)) {
      throw new Error(
        `Cannot generate receipt. Payment status is '${rideExists.paymentStatus || 'NOT_SET'}' but must be one of: ${allowedPaymentStatuses.join(', ')}`,
      );
    }

    // Get full ride details - allow PROCESSING and PENDING payment status
    const ride = await Ride.findOne({
      _id: new mongoose.Types.ObjectId(bookingId),
      status: 'RIDE_COMPLETED',
      paymentStatus: { $in: ['COMPLETED', 'PROCESSING', 'PENDING'] },
    }).lean();

    if (!ride) {
      throw new Error('Ride not found with required status and payment conditions');
    }

    // Get related data
    const [passenger, driver] = await Promise.all([
      findPassengerById(ride.passengerId),
      findDriverById(ride.driverId),
    ]);

    if (!passenger) {
      throw new Error(`Passenger not found for ride ${bookingId}`);
    }
    if (!driver) {
      throw new Error(`Driver not found for ride ${bookingId}`);
    }

    // If transaction doesn't exist, create it on the fly from ride data
    let transaction = await RideTransaction.findOne({
      rideId: ride._id,
    }).lean();

    if (!transaction) {
      // Create transaction on the fly from ride data
      console.log(
        `📄 [generateRideReceipt] No transaction found for ride ${bookingId}, creating transaction on the fly...`,
      );

      // Calculate commission
      const commissionDoc = await Commission.findOne({
        carType: ride.carType,
      }).lean();

      if (!commissionDoc) {
        throw new Error(
          `Commission configuration not found for car type: ${ride.carType}`,
        );
      }

      const actualFare = ride.actualFare || ride.estimatedFare || 0;
      const discount = ride.fareBreakdown?.promoDiscount || 0;
      const tip = ride.tipBreakdown?.amount || 0;
      const commissionPercentage = commissionDoc.percentage;
      const commissionAmount = Math.floor((actualFare / 100) * commissionPercentage);
      const driverEarning = actualFare - commissionAmount;

      // Get payout week
      const getPayoutWeek = (date = new Date()) => {
        const weekStart = moment(date).startOf('isoWeek');
        return weekStart.format('DD-MM-YYYY');
      };

      // Create transaction - use COMPLETED status (valid enum value)
      const newTransaction = await RideTransaction.create({
        rideId: ride._id,
        driverId: ride.driverId,
        passengerId: ride.passengerId,
        amount: actualFare,
        commission: commissionAmount,
        discount: discount,
        tip: tip,
        driverEarning: driverEarning,
        paymentMethod: ride.paymentMethod,
        status: 'COMPLETED', // RideTransaction model only allows: COMPLETED, REFUNDED, DISPUTED
        payoutWeek: getPayoutWeek(new Date()),
        metadata: {
          createdOnFly: true,
          createdAt: new Date().toISOString(),
          originalPaymentStatus: ride.paymentStatus,
        },
      });

      transaction = newTransaction.toObject();
      console.log(
        `✅ [generateRideReceipt] Transaction created on the fly for ride ${bookingId}`,
      );
    } else {
      // Transaction exists, but check if status is allowed
      const allowedStatuses = ['COMPLETED', 'REFUNDED', 'DISPUTED'];
      if (!allowedStatuses.includes(transaction.status)) {
        throw new Error(
          `Transaction found but status is '${transaction.status}' which is not allowed. Allowed statuses: ${allowedStatuses.join(', ')}`,
        );
      }
    }

    // Generate PDF
    const pdfBuffer = await generatePDFBuffer(
      ride,
      transaction,
      driver,
      passenger,
      receiptType,
    );

    // Validate PDF before saving
    if (!pdfBuffer || pdfBuffer.length < 100) {
      throw new Error('Generated PDF is invalid');
    }

    // Save receipt (generate on-the-fly for driver/passenger, don't store separate PDFs)
    // We generate receipts on-the-fly based on who requests it
    // For backward compatibility, we still save a receipt record but generate PDF dynamically
    const receiptTypeSuffix = receiptType === 'driver' ? '-driver' : '-passenger';
    const receipt = await RideReceipt.findOneAndUpdate(
      { rideId: ride._id },
      {
        rideId: ride._id,
        driverId: driver._id,
        passengerId: passenger._id,
        pdfData: pdfBuffer, // Store the requested type's PDF (for backward compatibility)
        fileName: `receipt-${safeSliceId(ride._id)}${receiptTypeSuffix}.pdf`,
        generatedAt: new Date(),
        fileSize: pdfBuffer.length,
      },
      { upsert: true, new: true },
    );

    // Update ride with receipt reference
    await Ride.findByIdAndUpdate(ride._id, { receipt: receipt._id });

    return {
      success: true,
      receipt: {
        id: receipt._id,
        base64: pdfBuffer.toString('base64'),
        downloadUrl: `${env.BASE_URL}/user/passenger/booking-management/download?id=${ride._id}`,
        fileName: receipt.fileName,
      },
    };
  } catch (error) {
    console.error(`[generateRideReceipt] Error for bookingId ${bookingId}:`, {
      message: error.message,
      stack: error.stack,
      bookingId,
    });
    return {
      success: false,
      error: error.message || 'Failed to generate receipt',
    };
  }
};

export default generateRideReceipt;
