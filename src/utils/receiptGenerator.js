import PDFDocument from 'pdfkit';
import mongoose from 'mongoose';
import Ride from '../models/Ride.js';
import RideTransaction from '../models/RideTransaction.js';
import RideReceipt from '../models/RideReceipt.js';
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
const generatePDFBuffer = (ride, transaction, driver, passenger) => {
  return new Promise((resolve, reject) => {
    try {
      // Create PDF document with proper configuration
      const doc = new PDFDocument({
        size: 'A4',
        margins: {
          top: 50,
          bottom: 50,
          left: 50,
          right: 50,
        },
        info: {
          Title: `Ride Receipt - ${safeSliceId(ride._id)}`,
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

      // Generate content
      generateReceiptContent(doc, ride, transaction, driver, passenger);

      // Finalize PDF
      doc.end();
    } catch (error) {
      console.error('PDF setup error:', error);
      reject(new Error(`PDF document creation failed: ${error.message}`));
    }
  });
};

// Completely rewritten content generation function
const generateReceiptContent = (doc, ride, transaction, driver, passenger) => {
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
      .text('RIDE RECEIPT', 50, 50, { align: 'center' });

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

    let yPosition = 120;

    // Ride Information Section
    doc
      .fontSize(12)
      .fillColor('#000000')
      .font('Helvetica-Bold')
      .text('RIDE INFORMATION', 50, yPosition);

    yPosition += 20;

    doc
      .fontSize(10)
      .fillColor(secondaryColor)
      .font('Helvetica')
      .text(`Receipt #: ${safeSliceId(ride._id)}`, 50, yPosition);
    yPosition += 15;

    doc.text(`Date: ${formatDate(ride.createdAt)}`, 50, yPosition);
    yPosition += 15;

    doc.text(`Time: ${formatTime(ride.createdAt)}`, 50, yPosition);
    yPosition += 15;

    doc.text(`Duration: ${formatDuration(ride.actualDuration)}`, 50, yPosition);
    yPosition += 25;

    // Driver & Passenger Information
    const infoStartY = 120;

    // Driver Info
    doc
      .fontSize(12)
      .fillColor('#000000')
      .font('Helvetica-Bold')
      .text('DRIVER INFORMATION', 300, infoStartY);

    doc
      .fontSize(10)
      .fillColor(secondaryColor)
      .font('Helvetica')
      .text(`Driver Id: ${driver.uniqueId || 'N/A'}`, 300, infoStartY + 20)
      .text(`Name: ${driver.userId?.name || 'N/A'}`, 300, infoStartY + 20)
      .text(`Vehicle: ${driver.vehicle?.type || 'N/A'}`, 300, infoStartY + 35);

    // Passenger Info
    doc
      .fontSize(12)
      .fillColor('#000000')
      .font('Helvetica-Bold')
      .text('PASSENGER INFORMATION', 300, infoStartY + 60);

    doc
      .fontSize(10)
      .fillColor(secondaryColor)
      .font('Helvetica')
      .text(
        `Passenger Id: ${passenger.uniqueId || 'N/A'}`,
        300,
        infoStartY + 20,
      )
      .text(`Name: ${passenger.userId?.name || 'N/A'}`, 300, infoStartY + 80)
      .text(`email: ${passenger.userId?.email || 'N/A'}`, 300, infoStartY + 95);

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
      .text(' Pickup:', 65, yPosition)
      .text(
        ride.pickupLocation?.address || 'Location not specified',
        65,
        yPosition + 15,
      )
      .text(`Time: ${formatTime(ride.rideStartedAt || 'N/A')}`, 400, yPosition);

    yPosition += 40;

    // Dropoff Location
    doc
      .fillColor(primaryColor)
      .text('•', 50, yPosition)
      .fillColor(secondaryColor)
      .text(' Dropoff:', 65, yPosition)
      .text(
        ride.dropoffLocation?.address || 'Location not specified',
        65,
        yPosition + 15,
      )
      .text(
        `Time: ${formatTime(ride.rideCompletedAt || 'N/A')}`,
        400,
        yPosition,
      );

    yPosition += 60;

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
      .text(
        `Distance: ${(ride.actualDistance || 0).toFixed(2)} km`,
        70,
        yPosition + 35,
      )
      .text(
        `Duration: ${formatDuration(ride.actualDuration)}`,
        70,
        yPosition + 50,
      )
      .text(
        `Waiting: ${formatDuration(ride.actualWaitingTime)}`,
        70,
        yPosition + 50,
      )
      .text(`Payment: ${ride.paymentMethod || 'N/A'}`, 250, yPosition + 35)
      .text(
        `Transaction: ${safeSliceId(transaction._id)}`,
        250,
        yPosition + 50,
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

    yPosition += 5;
    doc
      .strokeColor(borderColor)
      .lineWidth(0.5)
      .moveTo(50, yPosition)
      .lineTo(545, yPosition)
      .stroke();

    yPosition += 15;

    // Fare Items
    const fareBreakdown = ride.fareBreakdown || {};
    const tipBreakdown = ride.tipBreakdown || {};

    const items = [
      {
        label: 'Setup Fee',
        amount: fareBreakdown.rideSetupFee || 0,
        type: 'income',
      },
      {
        label: 'Airport Fee',
        amount: fareBreakdown.airportRideFee || 0,
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
        type: 'income',
      },
      {
        label: 'Surge Amount',
        amount: fareBreakdown.surgeAmount || 0,
        type: 'income',
      },
      { label: 'Tips', amount: tipBreakdown.amount || 0, type: 'income' },
      {
        label: 'Total Amount Paid',
        amount: fareBreakdown.finalAmount || 0,
        type: 'deduction',
      },
      {
        label: 'Platform Fee',
        amount: transaction.commission || 0,
        type: 'deduction',
      },
      {
        label: 'Discount',
        amount:
          (tipBreakdown.promoDiscount || 0) + (fareBreakdown.discount || 0),
        type: 'deduction',
      },
    ];

    // Add items to PDF
    items.forEach((item) => {
      const amount = parseFloat(item.amount) || 0;
      if (amount > 0) {
        const amountText =
          item.type === 'deduction'
            ? `-${formatCurrency(amount)}`
            : formatCurrency(amount);
        const color = item.type === 'deduction' ? '#ef4444' : '#000000';

        doc
          .fillColor('#000000')
          .text(item.label, 50, yPosition)
          .fillColor(color)
          .text(amountText, 450, yPosition, { align: 'right' });

        yPosition += 15;
      }
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

    // Total Earnings
    const totalEarnings = parseFloat(transaction.driverEarning) || 0;
    doc
      .fontSize(12)
      .fillColor('#000000')
      .font('Helvetica-Bold')
      .text('TOTAL DRIVER EARNINGS', 50, yPosition)
      .text(`${formatCurrency(totalEarnings)} CAD`, 450, yPosition, {
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
      .text('Ride Receipt', 50, 50)
      .fontSize(10)
      .text(`Receipt ID: ${safeSliceId(ride._id)}`, 50, 80)
      .text('There was an error generating the full receipt details.', 50, 100);

    throw error;
  }
};

// Updated main function with PDF validation
export const generateRideReceipt = async (bookingId) => {
  try {
    // Validate input
    if (!bookingId || !mongoose.Types.ObjectId.isValid(bookingId)) {
      throw new Error('Invalid booking ID');
    }

    // Get ride details
    const ride = await Ride.findOne({
      _id: new mongoose.Types.ObjectId(bookingId),
      status: 'RIDE_COMPLETED',
      paymentStatus: 'COMPLETED',
    }).lean();

    if (!ride) {
      throw new Error('Ride not found');
    }

    // Get related data
    const [passenger, driver, transaction] = await Promise.all([
      findPassengerById(ride.passengerId),
      findDriverById(ride.driverId),
      RideTransaction.findOne({
        rideId: ride._id,
        status: 'COMPLETED',
      }).lean(),
    ]);

    if (!passenger) throw new Error('Passenger not found');
    if (!driver) throw new Error('Driver not found');
    if (!transaction) throw new Error('Transaction not found');

    // Generate PDF
    const pdfBuffer = await generatePDFBuffer(
      ride,
      transaction,
      driver,
      passenger,
    );

    // Validate PDF before saving
    if (!pdfBuffer || pdfBuffer.length < 100) {
      throw new Error('Generated PDF is invalid');
    }

    // Save receipt
    const receipt = await RideReceipt.findOneAndUpdate(
      { rideId: ride._id },
      {
        rideId: ride._id,
        driverId: driver._id,
        passengerId: passenger._id,
        pdfData: pdfBuffer,
        fileName: `receipt-${safeSliceId(ride._id)}.pdf`,
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
    console.error('Error generating receipt:', error);
    return {
      success: false,
      error: error.message,
    };
  }
};

export default generateRideReceipt;
