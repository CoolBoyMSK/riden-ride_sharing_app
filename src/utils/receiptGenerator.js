import PDFDocument from 'pdfkit';
import Ride from '../models/Ride.js';
import RideTransaction from '../models/RideTransaction.js';
import RideReceipt from '../models/RideReceipt.js';
import { findPassengerById } from '../dal/passenger.js';

// Store receipt in database and return base64
export const generateRideReceipt = async (booking, driver) => {
  try {
    // Get ride details with transaction information
    const ride = await Ride.findOne({
      _id: booking._id,
      driverId: driver._id,
      status: 'RIDE_COMPLETED',
    })
      .populate('riderId', 'name phone email')
      .lean();

    if (!ride) {
      throw new Error('Ride not found');
    }

    // Get transaction details
    const transaction = await RideTransaction.findOne({
      rideId: booking._id,
      status: 'COMPLETED',
    }).lean();

    if (!transaction) {
      throw new Error('Transaction not found');
    }

    // Generate PDF as buffer
    const passenger = await findPassengerById(ride.passengerId);
    if (!passenger) {
      throw new Error('Passenger not found');
    }

    const pdfBuffer = await generatePDFBuffer(
      ride,
      transaction,
      driver,
      passenger,
    );

    // Store receipt in database
    const receipt = await RideReceipt.findOneAndUpdate(
      { rideId: booking._id },
      {
        rideId: booking._id,
        driverId: driver._id,
        pdfData: pdfBuffer,
        fileName: `receipt-${ride.rideId}.pdf`,
        generatedAt: new Date(),
      },
      { upsert: true, new: true },
    );

    // Return base64 for mobile apps and URL for web
    const base64PDF = pdfBuffer.toString('base64');

    return {
      success: true,
      receipt: {
        id: receipt._id,
        base64: base64PDF,
        downloadUrl: `/api/receipts/${receipt._id}/download`,
        fileName: receipt.fileName,
      },
    };
  } catch (error) {
    console.error('Error generating receipt:', error);
    return false;
  }
};

// Generate PDF as buffer
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

// Download receipt by ID
export const downloadReceipt = async (req, res) => {
  try {
    const { receiptId } = req.params;

    const receipt = await RideReceipt.findById(receiptId);

    if (!receipt) {
      return res.status(404).json({ error: 'Receipt not found' });
    }

    // Verify the driver owns this receipt
    if (req.user._id.toString() !== receipt.driverId.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${receipt.fileName}"`,
    );
    res.send(receipt.pdfData);
  } catch (error) {
    console.error('Error downloading receipt:', error);
    res.status(500).json({ error: 'Failed to download receipt' });
  }
};

// Get receipt for a ride
export const getRideReceipt = async (req, res) => {
  try {
    const { rideId } = req.params;

    const receipt = await RideReceipt.findOne({
      rideId: rideId,
      driverId: req.user._id,
    });

    if (!receipt) {
      return res.status(404).json({ error: 'Receipt not found' });
    }

    res.json({
      success: true,
      receipt: {
        id: receipt._id,
        downloadUrl: `/api/receipts/${receipt._id}/download`,
        fileName: receipt.fileName,
        generatedAt: receipt.generatedAt,
      },
    });
  } catch (error) {
    console.error('Error getting receipt:', error);
    res.status(500).json({ error: 'Failed to get receipt' });
  }
};

const addReceiptContent = (doc, ride, transaction, driver, passenger) => {
  const { riderId, pickupLocation, dropoffLocation } = ride;

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
    .text(
      `Vehicle: ${driver.userId?.vehicleType || 'N/A'}`,
      300,
      yPosition + 35,
    );

  doc
    .fillColor('#000000')
    .font('Helvetica-Bold')
    .text('RIDER INFORMATION', 300, yPosition + 60);

  doc
    .fillColor(secondaryColor)
    .font('Helvetica')
    .text(`Name: ${passenger.userId?.name || 'N/A'}`, 300, yPosition + 80)
    .text(`Phone: ${driver.userId?.phone || 'N/A'}`, 300, yPosition + 95);

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

  const fareItems = [
    { label: 'Base Fare', amount: ride.fareBreakdown.baseFare || 0 },
    { label: 'Time Fare', amount: ride.fareBreakdown.timeFare || 0 },
    { label: 'Peak Charges', amount: ride.fareBreakdown.peakCharge || 0 },
    { label: 'Night Charges', amount: ride.fareBreakdown.nightCharge || 0 },
    { label: 'Distance Fare', amount: ride.fareBreakdown.distanceFare || 0 },
    { label: 'Waiting Charges', amount: ride.fareBreakdown.waitingCharge || 0 },
    { label: 'Tips', amount: ride.tipBreakdown.amount || 0 },
  ];

  const deductionItems = [
    { label: 'Platform Commission', amount: transaction.commission || 0 },
    { label: 'Discount Applied', amount: ride.tipBreakdown.promoDiscount || 0 },
  ];

  // Earnings items
  fareItems.forEach((item, index) => {
    if (item.amount > 0) {
      doc
        .fillColor('#000000')
        .text(item.label, 50, yPosition)
        .text(formatCurrency(item.amount), 450, yPosition, { align: 'right' });
      yPosition += 15;
    }
  });

  // Deductions
  deductionItems.forEach((item, index) => {
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
