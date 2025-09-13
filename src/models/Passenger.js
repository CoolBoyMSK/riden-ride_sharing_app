import mongoose from 'mongoose';

const cardPaymentSchema = new mongoose.Schema(
  {
    cardNumber: {
      type: String,
      trim: true,
    },
    holderName: {
      type: String,
      minLength: 4,
      maxLength: 4,
      require: true,
    },
    BankName: {
      type: String,
      required: true,
      trim: true,
    },
    cvv: {
      type: String,
      minLenght: 3,
      maxLength: 4,
      required: true,
    },
    expiryMonth: {
      type: Number,
      min: 1,
      max: 12,
      required: true,
    },
    expiryYear: {
      type: Number,
      min: new Date().getFullYear(),
    },
  },
  { _id: false },
);

const paymentMethodSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['CARD'],
      default: 'CARD',
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
    card: {
      type: cardPaymentSchema,
      required: () => {
        return this.type === 'CARD';
      },
    },
  },
  { _id: true, timestamps: true },
);

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
    isActive: {
      type: Boolean,
      default: false,
    },
    isBlocked: {
      type: Boolean,
      default: false,
    },
    paymentMethods: [paymentMethodSchema],
    addresses: [addressSchema],
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
