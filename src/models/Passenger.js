import mongoose from 'mongoose';

const passengerSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      unique: true,
      required: true,
    },
    favoritePlaces: [
      {
        name: { type: String, trim: true },
        coords: {
          lat: { type: Number, required: true },
          lng: { type: Number, required: true },
        },
      },
    ],
    paymentMethods: [
      {
        type: {
          type: String,
          enum: ['card', 'wallet', 'cash'],
          required: true,
        },
        details: {
          cardToken: String,
          walletId: String,
        },
      },
    ],
  },
  {
    timestamps: true,
  },
);

export default mongoose.model('Passenger', passengerSchema);
