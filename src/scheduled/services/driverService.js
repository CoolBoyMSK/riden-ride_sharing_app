import DriverWallet from '../../models/DriverWallet.js';

export const getDriversCursor = ({ minPending = 10 } = {}) => {
  // find drivers who have pendingBalance >= minPending
  // lean cursor to minimize memory
  return DriverWallet.find({ pendingBalance: { $gte: minPending } })
    .populate('driverId')
    .lean()
    .cursor();
};
