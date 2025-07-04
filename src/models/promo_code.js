import mongoose from 'mongoose';

const promoCodeSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      length: 8,
    },
    discount: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    startsAt: {
      type: Date,
      required: true,
    },
    endsAt: {
      type: Date,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

const PromoCodeModel = mongoose.model('PromoCode', promoCodeSchema);
export default PromoCodeModel;
