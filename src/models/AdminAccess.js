import mongoose from 'mongoose';

const MODULES = [
  'analytics',
  'admin_roles',
  'driver_management',
  'passenger_management',
  'vehicle_type_management',
  'booking_management',
  'reviews_ratings',
  'promo_code_management',
  'fare_management',
  'commission_management',
  'payment_management',
  'advertising_management',
  'report_management',
  'support_ticket',
  'notifications',
  'cms_management',
];

const adminAccessSchema = new mongoose.Schema(
  {
    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      required: true,
      unique: true,
    },
    modules: [
      {
        type: String,
        enum: MODULES,
      },
    ],
  },
  { timestamps: true },
);

const AdminAccessModel = mongoose.model('AdminAccess', adminAccessSchema);

export default AdminAccessModel;
