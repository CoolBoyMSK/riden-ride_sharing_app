import mongoose from 'mongoose';

const rideReceiptSchema = new mongoose.Schema({
  rideId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Ride',
    required: true,
    unique: true,
  },
  driverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Driver',
    required: true,
  },
  pdfData: {
    type: Buffer,
    required: true,
  },
  fileName: {
    type: String,
    required: true,
  },
  generatedAt: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model('RideReceipt', rideReceiptSchema);
