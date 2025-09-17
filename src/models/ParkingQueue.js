import mongoose from 'mongoose';

const parkingQueueSchema = new mongoose.Schema(
  {
    parkingLotId: {
      type: Number,
      required: true,
      unique: true,
    },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number],
        required: true,
        index: '2dsphere',
      },
    },
    driverIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Driver',
      },
    ],
  },
  { timestamps: true },
);

export default mongoose.model('ParkingQueue', parkingQueueSchema);
