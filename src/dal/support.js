import ComplainModel from '../models/ComplainTicket.js';

export const createComplain = async (payload) => ComplainModel.create(payload);

export const findComplains = async (userId, { page = 1, limit = 10 } = {}) => {
  const skip = (page - 1) * limit;

  const [complains, total] = await Promise.all([
    ComplainModel.find({ userId })
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 }), // ✅ Optional: newest first
    ComplainModel.countDocuments({ userId }),
  ]);

  return {
    complains,
    total,
    page: page ? parseInt(page) : 0,
    limit: limit ? parseInt(limit) : 0,
    totalPages: Math.ceil(total / limit),
  };
};

export const findComplainById = async (id) => ComplainModel.findById(id);
