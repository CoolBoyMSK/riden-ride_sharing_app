import AdminModel from '../../models/Admin.js';

export const findAdminByEmail = (email) => AdminModel.findOne({ email });

export const findAdminById = (id) => AdminModel.findById(id);

export const findAllAdmins = (page, limit) =>
  AdminModel.find({}, '-password -__v')
    .skip((page - 1) * limit)
    .limit(limit)
    .sort({ createdAt: -1 })
    .lean();

export const countAdmins = (filter = {}) => AdminModel.countDocuments(filter);

export const createAdmin = (adminData) => new AdminModel(adminData).save();

export const updateAdminById = (id, update) =>
  AdminModel.findByIdAndUpdate(id, update, { new: true }).lean();

export const searchAdmins = async (search, page = 1, limit = 10) => {
  if (!search || typeof search !== 'string' || !search.trim()) {
    throw new Error('Search term is required and must be a non-empty string.');
  }

  // Ensure pagination numbers are valid
  page = Math.max(parseInt(page, 10) || 1, 1);
  limit = Math.max(parseInt(limit, 10) || 10, 1);

  // Escape regex special characters safely
  const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const pipeline = [
    {
      $match: {
        $or: [
          { name: { $regex: escapedSearch, $options: 'i' } },
          { email: { $regex: escapedSearch, $options: 'i' } },
          { phoneNumber: { $regex: escapedSearch, $options: 'i' } },
        ],
      },
    },
    { $sort: { createdAt: -1 } },
    {
      $facet: {
        metadata: [{ $count: 'total' }],
        data: [
          { $skip: (page - 1) * limit },
          { $limit: limit },
          {
            $project: {
              password: 0, // Exclude sensitive fields
              __v: 0,
            },
          },
        ],
      },
    },
  ];

  const result = await AdminModel.aggregate(pipeline);

  const total = result[0]?.metadata[0]?.total || 0;
  const data = result[0]?.data || [];

  return {
    data,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
};

export const deleteAdmin = (id) => AdminModel.findByIdAndDelete(id);
