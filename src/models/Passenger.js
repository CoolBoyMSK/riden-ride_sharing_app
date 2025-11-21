import mongoose from 'mongoose';
import { CARD_TYPES, PAYMENT_METHODS } from '../enums/paymentEnums.js';

const addressSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      trim: true,
      required: true,
      minlength: 2,
      maxlength: 50,
    },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        required: true,
        default: 'Point',
      },
      coordinates: {
        type: [Number],
        required: true,
        index: '2dsphere',
        validate: {
          validator: function (value) {
            return (
              Array.isArray(value) &&
              value.length === 2 &&
              value[0] >= -180 &&
              value[0] <= 180 &&
              value[1] >= -90 &&
              value[1] <= 90
            );
          },
          message:
            'Coordinates must be [longitude, latitude] within valid ranges.',
        },
      },
    },
  },
  { _id: true },
);

const walletSchema = new mongoose.Schema(
  {
    enabled: {
      type: Boolean,
      default: false,
    },
    setupIntentId: {
      type: String,
      default: null,
    },
    clientSecret: {
      type: String,
      default: null,
    },
    paymentMethodId: {
      type: String,
      default: null,
    },
    paymentMethodCreatedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true, _id: false },
);

const paymentMethodSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: ['card', 'google_pay', 'apple_pay'],
      required: true,
    },
    cardType: {
      type: String,
      enum: CARD_TYPES,
      required: function () {
        return this.type === 'card';
      },
    },
    details: {
      type: Object,
      required: true,
    },
  },
  { timestamps: true, _id: false },
);

const passengerSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      unique: true,
      required: true,
    },
    uniqueId: {
      type: String,
      unique: true,
      required: true,
    },
    isOnRide: {
      type: Boolean,
      default: false,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: false,
    },
    isBlocked: {
      type: Boolean,
      default: false,
    },
    paymentMethods: [paymentMethodSchema],
    paymentMethodIds: [
      {
        type: String,
      },
    ],
    addresses: [addressSchema],
    stripeCustomerId: {
      type: String,
    },
    defaultCardId: {
      type: String,
    },
    isGooglePay: walletSchema,
    isApplePay: walletSchema,
  },
  {
    timestamps: true,
  },
);

passengerSchema.index(
  { userId: 1, 'paymentMethods.isDefault': 1 },
  {
    unique: true,
    partialFilterExpression: { 'paymentMethods.isDefault': true },
  },
);

export default mongoose.model('Passenger', passengerSchema);
