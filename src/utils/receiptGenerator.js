import PDFDocument from 'pdfkit';
import mongoose from 'mongoose';
import Ride from '../models/Ride.js';
import RideTransaction from '../models/RideTransaction.js';
import RideReceipt from '../models/RideReceipt.js';
import { findPassengerById } from '../dal/passenger.js';
import { findDriverById } from '../dal/driver.js';
import env from '../config/envConfig.js';

const formatDate = (date) => {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

const formatTime = (date) => {
  return new Date(date).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

const formatDuration = (seconds) => {
  if (!seconds) return '0 min';
  const minutes = Math.floor(seconds / 60);
  return `${minutes} min`;
};

const formatCurrency = (amount) => {
  if (!amount) return '$0.00';
  return `$${parseFloat(amount).toFixed(2)}`;
};

// Check if MongoDB is connected
const checkConnection = () => {
  if (mongoose.connection.readyState !== 1) {
    throw new Error('MongoDB not connected');
  }
};

// Connection retry logic
const withRetry = async (operation, maxRetries = 3, delay = 1000) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (error.name === 'MongooseError' && attempt < maxRetries) {
        console.log(`Attempt ${attempt} failed, retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2; // Exponential backoff
      } else {
        throw error;
      }
    }
  }
};

export const generateRideReceipt = async (bookingId) => {
  try {
    // Check connection first
    checkConnection();

    // Get ride details with transaction information - FIXED: use findOne() instead of find()
    const ride = await withRetry(async () => {
      return await Ride.findOne({
        _id: new mongoose.Types.ObjectId(bookingId),
        status: 'RIDE_COMPLETED',
        paymentStatus: 'COMPLETED',
      }).lean();
    });

    if (!ride) {
      throw new Error('Ride not found');
    }

    // Get passenger and driver in parallel
    const [passenger, driver] = await Promise.all([
      withRetry(() => findPassengerById(ride.passengerId)),
      withRetry(() => findDriverById(ride.driverId)),
    ]);

    if (!passenger) {
      throw new Error('Passenger not found');
    }

    if (!driver) {
      // FIXED: was checking passenger instead of driver
      throw new Error('Driver not found');
    }

    // Get transaction details
    const transaction = await withRetry(async () => {
      return await RideTransaction.findOne({
        rideId: ride._id,
        status: 'COMPLETED',
      }).lean();
    });

    if (!transaction) {
      throw new Error('Transaction not found');
    }

    // Generate PDF as buffer
    const pdfBuffer = await generatePDFBuffer(
      ride,
      transaction,
      driver,
      passenger,
    );

    // Store receipt in database
    const receipt = await withRetry(async () => {
      return await RideReceipt.findOneAndUpdate(
        { rideId: ride._id },
        {
          rideId: ride._id,
          driverId: driver._id,
          passengerId: passenger._id,
          pdfData: pdfBuffer,
          fileName: `receipt-${ride.rideId}.pdf`, // FIXED: was ride.rideId, should be ride._id
          generatedAt: new Date(),
        },
        { upsert: true, new: true },
      );
    });
    if (!receipt) {
      throw new Error('Receipt generation failed');
    }

    // Return base64 for mobile apps and URL for web
    const base64PDF = pdfBuffer.toString('base64');

    const updatedRide = await withRetry(async () => {
      return await Ride.findByIdAndUpdate(
        ride._id,
        {
          receipt,
        },
        { new: true },
      );
    });
    if (!updatedRide) {
      throw new Error('Failed to update ride');
    }

    return {
      success: true,
      receipt: {
        id: receipt._id,
        base64: base64PDF,
        downloadUrl: `${env.BASE_URL}/user/passenger/booking-management/download?id=${receipt._id}`,
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

const generatePDFBuffer = (ride, transaction, driver, passenger) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 50,
      });

      const chunks = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Add receipt content
      addReceiptContent(doc, ride, transaction, driver, passenger);

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

const addReceiptContent = (doc, ride, transaction, driver, passenger) => {
  const { pickupLocation, dropoffLocation } = ride;

  // Colors
  const primaryColor = '#2563eb';
  const secondaryColor = '#6b7280';
  const borderColor = '#e5e7eb';

  // Header with logo and title
  doc
    .fillColor(primaryColor)
    .fontSize(24)
    .font('Helvetica-Bold')
    .text('RIDE RECEIPT', 50, 50, { align: 'center' });

  doc
    .fillColor(secondaryColor)
    .fontSize(10)
    .font('Helvetica')
    .text('Thank you for driving with us!', 50, 80, { align: 'center' });

  // Draw separator line
  doc
    .strokeColor(borderColor)
    .lineWidth(1)
    .moveTo(50, 100)
    .lineTo(545, 100)
    .stroke();

  let yPosition = 130;

  // Two column layout
  // Left column - Ride Information
  doc
    .fillColor('#000000')
    .fontSize(12)
    .font('Helvetica-Bold')
    .text('RIDE INFORMATION', 50, yPosition);

  doc
    .fillColor(secondaryColor)
    .fontSize(10)
    .font('Helvetica')
    .text(`Receipt #: ${ride._id.toString().slice(-8)}`, 50, yPosition + 20)
    .text(`Date: ${formatDate(ride.createdAt)}`, 50, yPosition + 35)
    .text(`Time: ${formatTime(ride.createdAt)}`, 50, yPosition + 50)
    .text(
      `Ride Duration: ${formatDuration(ride.actualDuration || 0)}`,
      50,
      yPosition + 65,
    );

  // Right column - Driver & Rider Info
  doc
    .fillColor('#000000')
    .font('Helvetica-Bold')
    .text('DRIVER INFORMATION', 300, yPosition);

  doc
    .fillColor(secondaryColor)
    .font('Helvetica')
    .text(`Name: ${driver.userId?.name || 'Driver'}`, 300, yPosition + 20)
    .text(`Vehicle: ${driver.vehicle?.type || 'N/A'}`, 300, yPosition + 35);

  doc
    .fillColor('#000000')
    .font('Helvetica-Bold')
    .text('RIDER INFORMATION', 300, yPosition + 60);

  doc
    .fillColor(secondaryColor)
    .font('Helvetica')
    .text(`Name: ${passenger.userId?.name || 'N/A'}`, 300, yPosition + 80)
    .text(
      `Phone: ${passenger.userId?.phoneNumber || 'N/A'}`,
      300,
      yPosition + 95,
    );

  yPosition += 140;

  // Trip Route Section
  doc
    .fillColor('#000000')
    .fontSize(12)
    .font('Helvetica-Bold')
    .text('TRIP ROUTE', 50, yPosition);

  yPosition += 25;

  // Start location with pin icon
  doc
    .fillColor(primaryColor)
    .text('●', 50, yPosition)
    .fillColor(secondaryColor)
    .text('Pickup', 65, yPosition)
    .text(
      pickupLocation?.address || 'Location not specified',
      65,
      yPosition + 15,
    )
    .text(formatTime(ride.rideStartedAt || ride.createdAt), 400, yPosition);

  yPosition += 45;

  // End location with pin icon
  doc
    .fillColor('#10b981')
    .text('●', 50, yPosition)
    .fillColor(secondaryColor)
    .text('Dropoff', 65, yPosition)
    .text(
      dropoffLocation?.address || 'Location not specified',
      65,
      yPosition + 15,
    )
    .text(formatTime(ride.rideCompletedAt || ride.createdAt), 400, yPosition);

  yPosition += 60;

  // Trip Summary Box
  doc
    .roundedRect(50, yPosition, 495, 80, 5)
    .fill('#f8fafc')
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
      `Duration: ${formatDuration(ride.actualDuration || 0)}`,
      70,
      yPosition + 50,
    )
    .text(`Payment Method: ${ride.paymentMethod || 'N/A'}`, 250, yPosition + 35)
    .text(
      `Transaction ID: ${transaction._id.toString().slice(-8)}`,
      250,
      yPosition + 50,
    );

  yPosition += 110;

  // Fare Breakdown Table
  doc
    .fillColor('#000000')
    .fontSize(12)
    .font('Helvetica-Bold')
    .text('FARE BREAKDOWN', 50, yPosition);

  yPosition += 25;

  // Table headers
  doc
    .fillColor(secondaryColor)
    .fontSize(10)
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

  // Safe fare breakdown with proper null checks
  const fareBreakdown = ride.fareBreakdown || {};
  const tipBreakdown = ride.tipBreakdown || {};

  const fareItems = [
    { label: 'Base Fare', amount: fareBreakdown.baseFare || 0 },
    { label: 'Time Fare', amount: fareBreakdown.timeFare || 0 },
    { label: 'Peak Charges', amount: fareBreakdown.peakCharge || 0 },
    { label: 'Night Charges', amount: fareBreakdown.nightCharge || 0 },
    { label: 'Distance Fare', amount: fareBreakdown.distanceFare || 0 },
    { label: 'Waiting Charges', amount: fareBreakdown.waitingCharge || 0 },
    { label: 'Tips', amount: tipBreakdown.amount || 0 },
  ];

  const deductionItems = [
    { label: 'Platform Commission', amount: transaction.commission || 0 },
    { label: 'Discount Applied', amount: tipBreakdown.promoDiscount || 0 },
  ];

  // Earnings items
  fareItems.forEach((item) => {
    if (item.amount > 0) {
      doc
        .fillColor('#000000')
        .text(item.label, 50, yPosition)
        .text(formatCurrency(item.amount), 450, yPosition, { align: 'right' });
      yPosition += 15;
    }
  });

  // Deductions
  deductionItems.forEach((item) => {
    if (item.amount > 0) {
      doc
        .fillColor('#ef4444')
        .text(item.label, 50, yPosition)
        .text(`-${formatCurrency(item.amount)}`, 450, yPosition, {
          align: 'right',
        });
      yPosition += 15;
    }
  });

  yPosition += 10;

  // Total separator
  doc
    .strokeColor(borderColor)
    .lineWidth(1)
    .moveTo(50, yPosition)
    .lineTo(545, yPosition)
    .stroke();

  yPosition += 15;

  // Total Earnings
  doc
    .fillColor('#000000')
    .fontSize(12)
    .font('Helvetica-Bold')
    .text('TOTAL EARNINGS', 50, yPosition)
    .text(formatCurrency(transaction.driverEarning || 0), 450, yPosition, {
      align: 'right',
    });

  yPosition += 40;

  // Footer
  doc
    .fillColor(secondaryColor)
    .fontSize(8)
    .text(
      'This is an electronically generated receipt. No signature is required.',
      50,
      yPosition,
      { align: 'center' },
    )
    .text(
      `Generated on: ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}`,
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
};
