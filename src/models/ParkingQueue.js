import mongoose from 'mongoose';

// const parkingQueueSchema = new mongoose.Schema(
//   {
//     parkingLotId: {
//       type: Number,
//       required: true,
//       unique: true,
//     },
//     location: {
//       type: {
//         type: String,
//         enum: ['Point'],
//         default: 'Point',
//       },
//       coordinates: {
//         type: [Number],
//         required: true,
//         index: '2dsphere',
//       },
//     },
//     driverIds: [
//       {
//         type: mongoose.Schema.Types.ObjectId,
//         ref: 'Driver',
//       },
//     ],
//   },
//   { timestamps: true },
// );

// parkingQueue.model.js
const parkingQueueSchema = new mongoose.Schema(
  {
    parkingLotId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Zone',
      required: true,
      index: true,
      unique: true,
    },
    airportId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Zone',
      required: true,
      index: true,
    },
    driverQueue: [
      {
        driverId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Driver',
          // required: true,
        },
        joinedAt: {
          type: Date,
          default: Date.now,
        },
        status: {
          type: String,
          enum: ['waiting', 'offered', 'responding'],
          default: 'waiting',
        },
        currentOfferId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Ride',
          default: null,
        },
      },
    ],
    activeOffers: [
      {
        rideId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Ride',
          // required: true,
        },
        offeredAt: {
          type: Date,
          default: Date.now,
        },
        expiresAt: {
          type: Date,
          // required: true,
        },
      },
    ],
    maxQueueSize: {
      type: Number,
      default: 100,
      min: 10,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

// Index for efficient queue operations
parkingQueueSchema.index({ 'driverQueue.driverId': 1 });
parkingQueueSchema.index({ 'activeOffers.rideId': 1 });
parkingQueueSchema.index({ 'activeOffers.expiresAt': 1 });

export default mongoose.model('ParkingQueue', parkingQueueSchema);
