import DriverWallet from '../../models/DriverWallet.js';

export const getDriverBalance = async (driverId) => {
  const driverWallet = await DriverWallet.findOne(driverId).lean();
  // adapt to your schema
  const wallet = driverWallet || {
    pendingBalance: 0,
    availableBalance: 0,
    negativeBalance: 0,
  };
  return wallet;
};

export const decreaseDriverPendingBalance = async (
  driverId,
  amount,
  options = {},
) => {
  const session = options.session;
  // Atomically decrease pendingBalance
  await DriverWallet.updateOne(
    { driverId },
    {
      $inc: { pendingBalance: -amount },
    },
    { session },
  );
};

export const increaseDriverAvailableBalance = async (
  driverId,
  amount,
  options = {},
) => {
  const session = options.session;
  await DriverWallet.updateOne(
    { driverId },
    {
      $inc: { availableBalance: amount },
    },
    { session },
  );
};
