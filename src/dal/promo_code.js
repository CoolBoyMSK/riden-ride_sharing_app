import PromoCodeModel from '../models/promo_code.js';

export const findPromoById = async (id) => {
  return PromoCodeModel.findOne({ _id: id });
};

export const countPromos = async (filter) => {
  return PromoCodeModel.countDocuments(filter);
};

export const createPromoCode = async (payload) => {
  const promo = new PromoCodeModel(payload);
  return promo.save();
};

export const findPromoByCode = async (code) => {
  return PromoCodeModel.findOne({ code }).lean();
};

export const promoAvalability = async (id, code) => {
  return PromoCodeModel.findOne({
    code,
    _id: { $ne: id },
  }).lean();
};

export const listPromos = async ({ page, limit }, filter = {}) => {
  return PromoCodeModel.find(filter)
    .skip((page - 1) * limit)
    .limit(limit)
    .sort({ createdAt: -1 })
    .lean();
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
    endsAt: { $gte: currentDate },
  }).lean();
};

// Find active promo codes
export const findActivePromoCodes = async () => {
  const currentDate = new Date();

  return await PromoCodeModel.find({
    isActive: true,
    startsAt: { $lte: currentDate },
    endsAt: { $gte: currentDate },
  }).lean();
};

export const searchPromoCode = async (search = '', page = 1, limit = 10) => {
  // Ensure numbers and bounds
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, parseInt(limit, 10) || 10);
  const skip = (pageNum - 1) * limitNum;

  // Escape special regex chars to avoid ReDoS
  const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const pipeline = [
    {
      $match: {
        code: { $regex: escapedSearch, $options: 'i' },
      },
    },
    { $sort: { createdAt: -1 } },
    {
      $facet: {
        metadata: [{ $count: 'total' }],
        data: [{ $skip: skip }, { $limit: limitNum }],
      },
    },
  ];

  const result = await PromoCodeModel.aggregate(pipeline);

  const total = result?.[0]?.metadata?.[0]?.total || 0;
  const data = result?.[0]?.data || [];

  return {
    data,
    total,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil(total / limitNum),
  };
};

