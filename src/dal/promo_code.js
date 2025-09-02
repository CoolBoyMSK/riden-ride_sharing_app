import PromoCodeModel from '../models/promo_code.js';

export const createPromoCode = async (payload) => {
  const promo = new PromoCodeModel(payload);
  return promo.save();
};

export const findPromoByCode = async (code) => {
  return PromoCodeModel.findOne({ code }).lean();
};

export const listPromos = async (filter = {}) => {
  return PromoCodeModel.find(filter).sort({ createdAt: -1 }).lean();
};

export const updatePromoById = async (id, update) => {
  return PromoCodeModel.findByIdAndUpdate(id, update, { new: true }).lean();
};

export const deletePromoById = async (id) => {
  return PromoCodeModel.findByIdAndDelete(id);
};

// Validate promo code for ride booking
export const validatePromoCode = async (code) => {
  const currentDate = new Date();
  
  return await PromoCodeModel.findOne({
    code: code.toUpperCase(),
    isActive: true,
    startsAt: { $lte: currentDate },
    endsAt: { $gte: currentDate }
  }).lean();
};

// Find active promo codes
export const findActivePromoCodes = async () => {
  const currentDate = new Date();
  
  return await PromoCodeModel.find({
    isActive: true,
    startsAt: { $lte: currentDate },
    endsAt: { $gte: currentDate }
  }).lean();
};