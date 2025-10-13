import Stripe from 'stripe';
import mongoose from 'mongoose';
import PayoutRequestModel from '../models/InstantPayoutRequest.js';
import RefundTransaction from '../models/RefundTransaction.js';
import RideTransaction from '../models/RideTransaction.js';
import AdminCommission from '../models/AdminCommission.js';
import TransactionModel from '../models/Transaction.js';
import DriverWallet from '../models/DriverWallet.js';
import DriverPayout from '../models/DriverPayout.js';
import PassengerModel from '../models/Passenger.js';
import DriverModel from '../models/Driver.js';
import PassengerWallet from '../models/Wallet.js';
import PayoutModel from '../models/Payout.js';
import RideModel from '../models/Ride.js';
import env from '../config/envConfig.js';
import { notifyUser } from '../dal/notification.js';

const stripe = new Stripe(env.STRIPE_SECRET_KEY);

export const getWeekRange = (date = new Date()) => {
  // Clone the input date to avoid mutating it
  const current = new Date(date);

  // Get the day of the week (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
  const day = current.getDay();

  // Calculate difference to reach Monday
  const diffToMonday = (day === 0 ? -6 : 1) - day;

  // Calculate Monday (week start)
  const monday = new Date(current);
  monday.setDate(current.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);

  // Calculate Sunday (week end)
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  // Format to 'dd-mm-yyyy'
  const formatDate = (d) =>
    `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;

  return {
    weekStart: formatDate(monday),
    weekEnd: formatDate(sunday),
    weekStartDate: monday,
    weekEndDate: sunday,
  };
};

const savePassengerPaymentMethod = async (passengerId, cardId) =>
  PassengerModel.findByIdAndUpdate(
    passengerId,
    { $push: { paymentMethodIds: cardId } },
    { new: true },
  );

const updatePassengerPaymentMethod = async (passengerId, cardId) =>
  PassengerModel.findByIdAndUpdate(
    passengerId,
    {
      $pull: { paymentMethodIds: { $in: [cardId] } },
    },
    { new: true },
  );

const saveDriverPayoutMethod = async (driverId, accountId) =>
  DriverModel.findByIdAndUpdate(
    driverId,
    { $push: { payoutMethodIds: accountId } },
    { new: true },
  );

const updateDriverPayoutMethod = async (driverId, accountId) =>
  PassengerModel.findByIdAndUpdate(
    driverId,
    {
      $pull: { payoutMethodIds: { $in: [accountId] } },
    },
    { new: true },
  );

export const createPassengerWallet = async (passengerId) =>
  PassengerWallet.create({ passengerId });

export const getPassengerWallet = async (passengerId) =>
  PassengerWallet.findOne({ passengerId });

const increasePassengerAvailableBalance = async (passengerId, amount) =>
  PassengerWallet.findOneAndUpdate(
    { passengerId },
    { $inc: { availableBalance: amount } },
    { new: true },
  );

const decreasePassengerAvailableBalance = async (passengerId, amount) =>
  PassengerWallet.findOneAndUpdate(
    { passengerId },
    { $inc: { availableBalance: -amount } },
    { new: true },
  );

const increasePassengerNegativeBalance = async (passengerId, amount) =>
  PassengerWallet.findOneAndUpdate(
    { passengerId },
    { $inc: { negativeBalance: amount } },
    { new: true },
  );

const decreasePassengerNegativeBalance = async (passengerId, amount) =>
  PassengerWallet.findOneAndUpdate(
    { passengerId },
    { $inc: { negativeBalance: -amount } },
    { new: true },
  );

export const createDriverWallet = async (driverId) =>
  DriverWallet.create({ driverId });

const getDriverBalance = async (driverId) => DriverWallet.findOne({ driverId });

const increaseDriverPendingBalance = async (driverId, amount) =>
  DriverWallet.findOneAndUpdate(
    { driverId },
    { $inc: { pendingBalance: amount } },
    { new: true },
  );

const decreaseDriverPendingBalance = async (driverId, amount) =>
  DriverWallet.findOneAndUpdate(
    { driverId },
    { $inc: { pendingBalance: -amount } },
    { new: true },
  );

const increaseDriverAvailableBalance = async (driverId, amount) =>
  DriverWallet.findOneAndUpdate(
    { driverId },
    { $inc: { availableBalance: amount } },
    { new: true },
  );

const decreaseDriverAvailableBalance = async (driverId, amount) =>
  DriverWallet.findOneAndUpdate(
    { driverId },
    { $inc: { availableBalance: -amount } },
    { new: true },
  );

const increaseDriverNegativeBalance = async (driverId, amount) =>
  DriverWallet.findOneAndUpdate(
    { driverId },
    { $inc: { negativeBalance: amount } },
    { new: true },
  );

const decreaseDriverNegativeBalance = async (driverId, amount) =>
  DriverWallet.findOneAndUpdate(
    { driverId },
    { $inc: { negativeBalance: -amount } },
    { new: true },
  );

const createTransaction = async (payload) => TransactionModel.create(payload);

export const findTransaction = async (payload) =>
  TransactionModel.findOne(payload);

export const getDefaultCard = async (stripeCustomerId) =>
  PassengerModel.findOne({ stripeCustomerId }).select('defaultCardId');

export const setDefaultCard = async (stripeCustomerId, defaultCardId) =>
  PassengerModel.findOneAndUpdate(
    { stripeCustomerId },
    { defaultCardId },
    { new: true },
  );

export const getDefaultAccount = async (stripeAccountId) =>
  DriverModel.findOne({ stripeAccountId }).select('defaultAccountId');

export const setDefaultAccount = async (stripeAccountId, defaultAccountId) =>
  DriverModel.findOneAndUpdate(
    { stripeAccountId },
    { defaultAccountId },
    { new: true },
  );

export const createPayout = async (
  driverId,
  amount,
  payoutType,
  rides,
  payoutRequestId,
  status,
) =>
  PayoutModel.create({
    driverId,
    amount,
    payoutType,
    rides: rides || [],
    payoutRequestId,
    status,
  });

export const getDriverUnpaidBalance = async (driverId) => {
  const completedRides = await RideModel.aggregate([
    {
      $match: {
        driverId: new mongoose.Types.ObjectId(driverId),
        status: 'RIDE_COMPLETED',
        paymentStatus: 'COMPLETED',
      },
    },
    {
      $project: {
        rideId: '$_id',
        fare: { $ifNull: ['$actualFare', 0] },
        tip: { $ifNull: ['$tipBreakdown.amount', 0] },
        isDestinationRide: 1,
      },
    },
    {
      $addFields: {
        platformFee: {
          $cond: [
            { $eq: ['$isDestinationRide', true] },
            { $multiply: ['$fare', 0.45] }, // ✅ fee only on fare
            { $multiply: ['$fare', 0.25] },
          ],
        },
        totalRideEarnings: { $add: ['$fare', '$tip'] }, // fare + tip
      },
    },
    {
      $group: {
        _id: null,
        rideIds: { $push: '$rideId' }, // ✅ collect ride IDs
        totalEarnings: { $sum: '$totalRideEarnings' }, // fare + tip
        totalTips: { $sum: '$tip' },
        totalFares: { $sum: '$fare' },
        totalPlatformFees: { $sum: '$platformFee' },
        rideCount: { $sum: 1 },
      },
    },
  ]);

  const totalEarnings = completedRides[0]?.totalEarnings || 0;
  const totalFares = completedRides[0]?.totalFares || 0;
  const totalTips = completedRides[0]?.totalTips || 0;
  const totalPlatformFees = completedRides[0]?.totalPlatformFees || 0;
  const rideIds = completedRides[0]?.rideIds || [];

  // ✅ driver gets: (fare - platformFee) + full tips
  const netEarnings = totalFares - totalPlatformFees + totalTips;
  const rideCount = completedRides[0]?.rideCount || 0;

  return {
    totalFares,
    totalTips,
    totalPlatformFees,
    totalEarnings, // fares + tips before deductions
    netEarnings, // after deducting platform fee (tips untouched)
    rideCount,
    rideIds, // ✅ return unpaid ride IDs
    unpaidBalance: netEarnings,
  };
};

export const createInstantPayoutRequest = async (driverId, amount, rideIds) =>
  PayoutRequestModel.create({
    driverId,
    amount,
    rides: rideIds || [],
  });

const updateRequestedPayoutStatus = async (requestId) =>
  PayoutRequestModel.findByIdAndUpdate(
    requestId,
    { status: 'APPROVED', approvedAt: new Date() },
    { new: true },
  );

const updateInstantPayoutStatuses = async (driverId) => {
  return await PayoutRequestModel.updateMany(
    { driverId, status: 'PENDING' },
    { $set: { status: 'REJECTED' } },
  );
};

export const findDriverHistory = async (driverId) => {
  return await DriverModel.findById(driverId).select('rideIds');
};

export const deleteDriverHistory = async (driverId) => {
  return await DriverModel.findByIdAndUpdate(
    driverId,
    { $set: { rideIds: [] } },
    { new: true },
  );
};

export const createDriverPayout = async (payload) => {
  return DriverPayout.create(payload);
};

const createRefundTransaction = async (payload) =>
  RefundTransaction.create(payload);

const createRideTransaction = async (payload) =>
  RideTransaction.create(payload);

// Passenger Flow
export const createPassengerStripeCustomer = async (user, passenger) => {
  const customer = await stripe.customers.create({
    name: user.name,
    email: user.email,
  });

  passenger.stripeCustomerId = customer.id;
  await passenger.save();
  return customer.id;
};

export const addPassengerPaymentMethod = async (
  passenger,
  paymentMethodData,
) => {
  // const paymentMethod = await stripe.paymentMethods.create({
  //   type: paymentMethodData.type,
  //   card: { token: '4000000000000077' }, // tok_mastercard, tok_amex, tok_visa, 4000000000000077
  //   billing_details: {
  //     name: paymentMethodData.name,
  //     email: paymentMethodData.email,
  //   },
  // });
  const paymentMethod = await stripe.paymentMethods.create({
    type: 'card',
    card: { token: 'tok_visa' },
  });

  await stripe.paymentMethods.attach(paymentMethod.id, {
    customer: passenger.stripeCustomerId,
  });

  const card = await getDefaultCard(passenger.stripeCustomerId);
  if (!card.defaultCardId) {
    await stripe.customers.update(passenger.stripeCustomerId, {
      invoice_settings: { default_payment_method: paymentMethod.id },
    });

    await setDefaultCard(passenger.stripeCustomerId, paymentMethod.id);
  }

  await savePassengerPaymentMethod(passenger._id, paymentMethod.id);

  return paymentMethod.id;
};

export const getPassengerCards = async (passenger) => {
  const paymentMethods = await stripe.paymentMethods.list({
    customer: passenger.stripeCustomerId,
    type: 'card',
  });

  return paymentMethods.data; // array of card objects
};

export const getCardDetails = async (paymentMethodId) => {
  const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
  return paymentMethod;
};

export const deletePassengerCard = async (passenger, paymentMethodId) => {
  const detachedPaymentMethod =
    await stripe.paymentMethods.detach(paymentMethodId);

  await updatePassengerPaymentMethod(passenger._id, paymentMethodId);

  const card = await getDefaultCard(passenger.stripeCustomerId);
  if (card.defaultCardId === paymentMethodId) {
    await setDefaultCard(passenger.stripeCustomerId, null);
  }

  return detachedPaymentMethod;
};

export const updatePassengerCard = async (paymentMethodId, updates) => {
  const updatedPaymentMethod = await stripe.paymentMethods.update(
    paymentMethodId,
    {
      billing_details: {
        name: updates.name,
        email: updates.email,
        address: updates.address,
      },
      metadata: updates.metadata || {},
    },
  );

  return updatedPaymentMethod;
};

export const setDefaultPassengerCard = async (customerId, paymentMethodId) => {
  const updatedCustomer = await stripe.customers.update(customerId, {
    invoice_settings: {
      default_payment_method: paymentMethodId,
    },
  });

  await setDefaultCard(customerId, paymentMethodId);

  return updatedCustomer;
};

export const addFundsToWallet = async (
  passenger,
  amount,
  paymentMethodId,
  category,
) => {
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      // Process Stripe payment
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount * 100,
        currency: 'cad',
        customer: passenger.stripeCustomerId,
        payment_method: paymentMethodId,
        confirm: true,
        off_session: true,
      });

      if (paymentIntent.status !== 'succeeded') {
        throw new Error('Top-up failed');
      }

      // Get wallet within transaction using session properly
      const wallet = await PassengerWallet.findOne({
        passengerId: passenger._id,
      })
        .session(session)
        .exec();

      if (!wallet) {
        throw new Error('Passenger wallet not found');
      }

      let remainingAmount = Number(amount);
      let negativeBalanceCleared = 0;
      let addedToAvailable = 0;

      // If passenger has negative balance, use funds to clear it first
      if (wallet.negativeBalance > 0) {
        const negativeBalance = wallet.negativeBalance;

        if (remainingAmount >= negativeBalance) {
          // Enough to clear all negative balance
          await decreasePassengerNegativeBalance(
            passenger._id,
            negativeBalance,
            session, // Pass session as parameter
          );
          negativeBalanceCleared = negativeBalance;
          remainingAmount -= negativeBalance;

          // Add remaining to available balance
          if (remainingAmount > 0) {
            await increasePassengerAvailableBalance(
              passenger._id,
              remainingAmount,
              session, // Pass session as parameter
            );
            addedToAvailable = remainingAmount;
          }
        } else {
          // Not enough to clear all negative balance
          await decreasePassengerNegativeBalance(
            passenger._id,
            remainingAmount,
            session, // Pass session as parameter
          );
          negativeBalanceCleared = remainingAmount;
          remainingAmount = 0;
        }
      } else {
        // No negative balance - add all to available balance
        await increasePassengerAvailableBalance(
          passenger._id,
          remainingAmount,
          session, // Pass session as parameter
        );
        addedToAvailable = remainingAmount;
      }

      // Create transaction record with session
      await TransactionModel.create(
        [
          {
            passengerId: passenger._id,
            walletId: wallet._id,
            type: 'CREDIT',
            category,
            amount: Number(amount), // Original amount added
            for: 'passenger',
            metadata: {
              ...paymentIntent,
              negativeBalanceCleared: negativeBalanceCleared,
              addedToAvailable: addedToAvailable,
              originalAmount: Number(amount),
            },
            status: paymentIntent.status,
            referenceId: paymentIntent.id,
            receiptUrl: paymentIntent.id,
          },
        ],
        { session },
      );
    });

    // Transaction committed successfully, now send notification
    const updatedWallet = await getPassengerWallet(passenger._id);

    let notificationMessage;
    if (updatedWallet.negativeBalance === 0) {
      // All negative balance cleared
      notificationMessage = `Payment successful! $${amount} has been added to your Riden wallet and your negative balance has been fully cleared.`;
    } else {
      // Partial or no negative balance cleared
      const clearedAmount = Number(amount) - updatedWallet.negativeBalance;
      notificationMessage = `Payment successful! $${amount} has been added to your Riden wallet. $${clearedAmount} was used to clear your negative balance.`;
    }

    const notify = await notifyUser({
      userId: passenger.userId,
      title: 'Payment Done 🎉',
      message: notificationMessage,
      module: 'payment',
      metadata: { amount, negativeBalance: updatedWallet.negativeBalance },
      type: 'ALERT',
      actionLink: `${env.FRONTEND_URL}/api/user/passenger/payment-method/wallet`,
    });

    if (!notify) {
      console.log('Failed to send notification, but payment was processed');
    }

    return {
      success: true,
      amountAdded: Number(amount),
      negativeBalanceCleared: true,
    };
  } catch (error) {
    console.error(`ADD FUNDS FAILED: ${error.message}`);

    // Send failure notification
    try {
      await notifyUser({
        userId: passenger.userId,
        title: '❌ Payment Failed',
        message: `We couldn't add funds to your wallet. ${error.message}`,
        module: 'payment',
        metadata: { error: error.message },
        type: 'ALERT',
        actionLink: `${env.FRONTEND_URL}/wallet`,
      });
    } catch (notifyErr) {
      console.error('Failed to send payment failure notification:', notifyErr);
    }

    return { success: false, error: error.message };
  } finally {
    await session.endSession();
  }
};

// export const payDriverFromWallet = async (
//   passenger,
//   driver,
//   ride,
//   amount,
//   actualAmount,
//   category,
// ) => {
//   try {
//     const wallet = await getPassengerWallet(passenger._id);
//     if (!wallet) throw new Error('Passenger wallet not found');

//     let parsedAmount = Number(amount);
//     if (isNaN(parsedAmount) || parsedAmount <= 0) {
//       throw new Error('Invalid amount provided');
//     }

//     if (wallet.availableBalance < parsedAmount) {
//       throw new Error('Insufficient wallet balance');
//     }

//     const driverWallet = await getDriverBalance(driver._id);
//     if (!driverWallet) throw new Error('Driver wallet not found');

//     await decreasePassengerAvailableBalance(passenger._id, parsedAmount);

//     if (driverWallet.negativeBalance > 0) {
//       const negative = driverWallet.negativeBalance;

//       if (parsedAmount >= negative) {
//         // Enough to clear all negative balance
//         await decreaseDriverNegativeBalance(driver._id, negative);
//         driverWallet.negativeBalance = 0;

//         const remaining = parsedAmount - negative;
//         if (remaining > 0) {
//           await increaseDriverPendingBalance(driver._id, remaining);
//         }
//       } else {
//         // Not enough to clear all negative balance
//         await decreaseDriverNegativeBalance(driver._id, parsedAmount);
//         driverWallet.negativeBalance = negative - parsedAmount;
//       }
//     } else {
//       // No negative balance — normal case
//       await increaseDriverPendingBalance(driver._id, parsedAmount);
//     }

//     const transaction = await createTransaction({
//       passengerId: passenger._id,
//       driverId: driver._id,
//       rideId: ride._id,
//       walletId: wallet._id,
//       type: 'DEBIT',
//       category,
//       for: 'passenger',
//       amount: actualAmount,
//       metadata: {},
//       status: 'succeeded',
//       referenceId: wallet._id,
//       receiptUrl: wallet._id,
//     });

//     await createTransaction({
//       passengerId: passenger._id,
//       driverId: driver._id,
//       rideId: ride._id,
//       walletId: wallet._id,
//       type: 'CREDIT',
//       category: 'PAYOUT',
//       amount,
//       for: 'driver',
//       metadata: {},
//       status: 'succeeded',
//       referenceId: wallet._id,
//       receiptUrl: wallet._id,
//     });

//     const notify = await notifyUser({
//       userId: passenger.userId,
//       title: '✅ Payment Successful!',
//       message: `Thanks for riding with RIDEN. Your payment of $${amount} was completed successfully. Receipt is available in your ride history.`,
//       module: 'payment',
//       metadata: ride,
//       type: 'ALERT',
//       actionLink: `${env.FRONTEND_URL}/ride?rideId=${ride._id}`,
//     });

//     const notifyDriver = await notifyUser({
//       userId: driver.userId,
//       title: '💰 Payment Received',
//       message: `You’ve received ${amount} for your recent ride.`,
//       module: 'payment',
//       metadata: ride,
//       type: 'ALERT',
//       actionLink: `${env.FRONTEND_URL}/ride?rideId=${ride._id}`,
//     });

//     if (!notify || !notifyDriver) {
//       console.log('Failed to send notification');
//     }

//     return { success: true, transaction };
//   } catch (error) {
//     console.error(`Payment Failed: ${error.message}`);

//     // 🔔 Failure Notification
//     try {
//       await notifyUser({
//         userId: passenger.userId,
//         title: '❌ Payment Failed',
//         message: `We couldn’t complete your wallet payment of PKR ${amount}. ${error.message}. Please try again.`,
//         module: 'payment',
//         metadata: { rideId: ride?._id, error: error.message },
//         type: 'ALERT',
//         actionLink: `${env.FRONTEND_URL}/wallet`,
//       });
//     } catch (notifyErr) {
//       console.error(
//         '❌ Failed to send payment failure notification:',
//         notifyErr,
//       );
//     }

//     return { error: error.message };
//   }
// };

export const payDriverFromWallet = async (
  passenger,
  driver,
  ride,
  amount,
  actualAmount,
  category,
) => {
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      // 1. Atomic checks within transaction - use direct Mongoose queries with session
      const [wallet, driverWallet] = await Promise.all([
        PassengerWallet.findOne({ passengerId: passenger._id }).session(
          session,
        ),
        DriverWallet.findOne({ driverId: driver._id }).session(session),
      ]);

      if (!wallet) throw new Error('Passenger wallet not found');
      if (!driverWallet) throw new Error('Driver wallet not found');

      let parsedAmount = Number(amount);
      let parsedActualAmount = Number(actualAmount);

      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        throw new Error('Invalid amount provided');
      }

      // Check if passenger has sufficient available balance
      if (wallet.availableBalance < parsedAmount) {
        const shortfall = parsedAmount - wallet.availableBalance;

        // Use available balance first
        if (wallet.availableBalance > 0) {
          await PassengerWallet.findOneAndUpdate(
            { passengerId: passenger._id },
            { $inc: { availableBalance: -wallet.availableBalance } },
            { session },
          );
        }

        // Add remaining to negative balance
        await PassengerWallet.findOneAndUpdate(
          { passengerId: passenger._id },
          { $inc: { negativeBalance: shortfall } },
          { session },
        );
      } else {
        // Sufficient balance - normal case
        await PassengerWallet.findOneAndUpdate(
          { passengerId: passenger._id },
          { $inc: { availableBalance: -parsedAmount } },
          { session },
        );
      }

      // Handle driver balance updates (driver always gets paid)
      if (driverWallet.negativeBalance > 0) {
        const negative = driverWallet.negativeBalance;

        if (parsedAmount >= negative) {
          // Enough to clear all negative balance
          await DriverWallet.findOneAndUpdate(
            { driverId: driver._id },
            { $inc: { negativeBalance: -negative } },
            { session },
          );

          const remaining = parsedAmount - negative;
          if (remaining > 0) {
            await DriverWallet.findOneAndUpdate(
              { driverId: driver._id },
              { $inc: { pendingBalance: remaining } },
              { session },
            );
          }
        } else {
          // Not enough to clear all negative balance
          await DriverWallet.findOneAndUpdate(
            { driverId: driver._id },
            { $inc: { negativeBalance: -parsedAmount } },
            { session },
          );
        }
      } else {
        // No negative balance — normal case
        await DriverWallet.findOneAndUpdate(
          { driverId: driver._id },
          { $inc: { pendingBalance: parsedAmount } },
          { session },
        );
      }

      // Get updated wallet to check if negative balance was used
      const updatedWallet = await PassengerWallet.findOne({
        passengerId: passenger._id,
      }).session(session);
      const negativeBalanceUsed = updatedWallet.negativeBalance > 0;

      // 3. Create transactions atomically using direct model creation with session
      await Promise.all([
        TransactionModel.create(
          [
            {
              passengerId: passenger._id,
              driverId: driver._id,
              rideId: ride._id,
              walletId: wallet._id,
              type: 'DEBIT',
              category,
              for: 'passenger',
              amount: parsedActualAmount,
              metadata: {
                negativeBalanceUsed: negativeBalanceUsed,
                negativeBalanceAmount: negativeBalanceUsed
                  ? parsedAmount - wallet.availableBalance
                  : 0,
                availableBalanceUsed: Math.min(
                  wallet.availableBalance,
                  parsedAmount,
                ),
              },
              status: 'succeeded',
              referenceId: wallet._id,
              receiptUrl: wallet._id,
            },
          ],
          { session },
        ).then((res) => res[0]),

        TransactionModel.create(
          [
            {
              passengerId: passenger._id,
              driverId: driver._id,
              rideId: ride._id,
              walletId: wallet._id,
              type: 'CREDIT',
              category: 'PAYOUT',
              amount: parsedAmount,
              for: 'driver',
              metadata: {
                negativeBalancePayment: negativeBalanceUsed,
              },
              status: 'succeeded',
              referenceId: wallet._id,
              receiptUrl: wallet._id,
            },
          ],
          { session },
        ).then((res) => res[0]),

        RideTransaction.create(
          [
            {
              rideId: ride._id,
              driverId: driver._id,
              passengerId: passenger._id,
              amount: parsedActualAmount,
              commission: parsedActualAmount - parsedAmount,
              discount: ride.fareBreakdown?.promoDiscount || 0,
              tip: ride.tipBreakdown?.amount || 0,
              driverEarning: parsedAmount,
              paymentMethod: ride.paymentMethod,
              status: 'COMPLETED',
              isRefunded: false,
              payoutWeek: new Date(),
              metadata: {
                negativeBalanceUsed: negativeBalanceUsed,
              },
            },
          ],
          { session },
        ).then((res) => res[0]),
      ]);
    });

    // Transaction committed successfully, now send notifications
    const updatedWallet = await getPassengerWallet(passenger._id);
    const negativeBalanceUsed = updatedWallet.negativeBalance > 0;

    const [notify, notifyDriver] = await Promise.allSettled([
      notifyUser({
        userId: passenger.userId,
        title: negativeBalanceUsed
          ? '⚠️ Payment Processed with Negative Balance'
          : '✅ Payment Successful!',
        message: negativeBalanceUsed
          ? `Your ride payment of $${amount} was processed. Insufficient wallet balance - $${updatedWallet.negativeBalance} added to negative balance. Please settle this before your next ride.`
          : `Thanks for riding with RIDEN. Your payment of $${amount} was completed successfully. Receipt is available in your ride history.`,
        module: 'payment',
        metadata: ride,
        type: 'ALERT',
        actionLink: `${env.FRONTEND_URL}/ride?rideId=${ride._id}`,
      }),
      notifyUser({
        userId: driver.userId,
        title: '💰 Payment Received',
        message: `You've received $${amount} for your recent ride.`,
        module: 'payment',
        metadata: ride,
        type: 'ALERT',
        actionLink: `${env.FRONTEND_URL}/ride?rideId=${ride._id}`,
      }),
    ]);

    if (notify.status === 'rejected' || notifyDriver.status === 'rejected') {
      console.log('Failed to send notification');
    }

    // Get the transaction for return value
    const transaction = await TransactionModel.findOne({
      rideId: ride._id,
      type: 'DEBIT',
      for: 'passenger',
    });

    return {
      success: true,
      transaction,
      negativeBalanceUsed: negativeBalanceUsed,
    };
  } catch (error) {
    console.error(`WALLET PAYMENT FAILED: ${error.message}`);

    // Send failure notification
    try {
      await notifyUser({
        userId: passenger.userId,
        title: '❌ Payment Failed',
        message: `We couldn't process your wallet payment. ${error.message}`,
        module: 'payment',
        metadata: { rideId: ride?._id, error: error.message },
        type: 'ALERT',
        actionLink: `${env.FRONTEND_URL}/wallet`,
      });
    } catch (notifyErr) {
      console.error('Failed to send payment failure notification:', notifyErr);
    }

    return { success: false, error: error.message };
  } finally {
    await session.endSession();
  }
};

export const passengerPaysDriver = async (
  passenger,
  driver,
  ride,
  amount, // Driver's share (after commission)
  actualAmount, // Total passenger pays (including commission)
  paymentMethodId,
  category,
) => {
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      // Validate amounts and calculate commission
      let parsedAmount = Number(amount);
      let parsedActualAmount = Number(actualAmount);

      if (
        isNaN(parsedAmount) ||
        parsedAmount <= 0 ||
        isNaN(parsedActualAmount) ||
        parsedActualAmount <= 0
      ) {
        throw new Error('Invalid amount provided');
      }

      // Commission should be positive
      const commissionAmount = parsedActualAmount - parsedAmount;
      if (commissionAmount <= 0) {
        throw new Error(
          'Commission calculation error: actual amount cannot be less than driver amount',
        );
      }

      // 1. Get both driver and passenger wallets within transaction using direct queries
      const [driverWallet, passengerWallet] = await Promise.all([
        DriverWallet.findOne({ driverId: driver._id }).session(session),
        PassengerWallet.findOne({ passengerId: passenger._id }).session(
          session,
        ),
      ]);

      if (!driverWallet) throw new Error('Driver wallet not found');
      if (!passengerWallet) throw new Error('Passenger wallet not found');

      // 2. Calculate total amount passenger needs to pay (ride fare + any negative balance)
      const passengerNegativeBalance = passengerWallet.negativeBalance || 0;
      const totalAmountToCharge = parsedActualAmount + passengerNegativeBalance;

      // 3. Process Stripe payment (charge total amount including any negative balance)
      const payment = await stripe.paymentIntents.create({
        amount: totalAmountToCharge * 100, // Charge ride fare + negative balance
        currency: 'cad',
        customer: passenger.stripeCustomerId,
        payment_method: paymentMethodId,
        off_session: true,
        confirm: true,
      });

      if (payment.status !== 'succeeded') {
        throw new Error(`Stripe payment failed: ${payment.status}`);
      }

      // 4. If passenger had negative balance, clear it first using direct update
      if (passengerNegativeBalance > 0) {
        await PassengerWallet.findOneAndUpdate(
          { passengerId: passenger._id },
          { $inc: { negativeBalance: -passengerNegativeBalance } },
          { session },
        );
      }

      // 5. Handle driver balance updates using direct updates
      if (driverWallet.negativeBalance > 0) {
        const negative = driverWallet.negativeBalance;

        if (parsedAmount >= negative) {
          await DriverWallet.findOneAndUpdate(
            { driverId: driver._id },
            { $inc: { negativeBalance: -negative } },
            { session },
          );
          const remaining = parsedAmount - negative;
          if (remaining > 0) {
            await DriverWallet.findOneAndUpdate(
              { driverId: driver._id },
              { $inc: { pendingBalance: remaining } },
              { session },
            );
          }
        } else {
          await DriverWallet.findOneAndUpdate(
            { driverId: driver._id },
            { $inc: { negativeBalance: -parsedAmount } },
            { session },
          );
        }
      } else {
        await DriverWallet.findOneAndUpdate(
          { driverId: driver._id },
          { $inc: { pendingBalance: parsedAmount } },
          { session },
        );
      }

      // 6. Create transactions and commission record atomically using direct model creation
      await Promise.all([
        TransactionModel.create(
          [
            {
              passengerId: passenger._id,
              driverId: driver._id,
              rideId: ride._id,
              type: 'DEBIT',
              category,
              amount: parsedActualAmount,
              for: 'passenger',
              metadata: {
                ...payment,
                negativeBalanceCleared: passengerNegativeBalance,
                totalCharged: totalAmountToCharge,
              },
              status: 'succeeded',
              referenceId: payment.id,
              receiptUrl: payment.id,
            },
          ],
          { session },
        ).then((res) => res[0]),

        TransactionModel.create(
          [
            {
              passengerId: passenger._id,
              driverId: driver._id,
              rideId: ride._id,
              type: 'CREDIT',
              category: 'PAYOUT',
              amount: parsedAmount,
              for: 'driver',
              metadata: payment,
              status: 'succeeded',
              referenceId: payment.id,
              receiptUrl: payment.id,
            },
          ],
          { session },
        ).then((res) => res[0]),

        ...(passengerNegativeBalance > 0
          ? [
              TransactionModel.create(
                [
                  {
                    passengerId: passenger._id,
                    type: 'CREDIT',
                    category: 'NEGATIVE_BALANCE_CLEARANCE',
                    amount: passengerNegativeBalance,
                    for: 'passenger',
                    metadata: {
                      paymentIntent: payment.id,
                      rideId: ride._id,
                      previousNegativeBalance: passengerNegativeBalance,
                    },
                    status: 'succeeded',
                    referenceId: `nb_clear_${payment.id}`,
                    receiptUrl: payment.id,
                  },
                ],
                { session },
              ).then((res) => res[0]),
            ]
          : []),

        RideTransaction.create(
          [
            {
              rideId: ride._id,
              driverId: driver._id,
              passengerId: passenger._id,
              amount: parsedActualAmount,
              commission: commissionAmount,
              discount: ride.fareBreakdown?.promoDiscount || 0,
              tip: ride.tipBreakdown?.amount || 0,
              driverEarning: parsedAmount,
              paymentMethod: ride.paymentMethod,
              status: 'COMPLETED',
              isRefunded: false,
              payoutWeek: new Date(),
            },
          ],
          { session },
        ).then((res) => res[0]),
      ]);
    });

    // Transaction committed successfully, now send notifications
    const updatedPassengerWallet = await getPassengerWallet(passenger._id);
    const hadNegativeBalance = updatedPassengerWallet.negativeBalance === 0;

    const [notify, notifyDriver] = await Promise.allSettled([
      notifyUser({
        userId: passenger.userId,
        title: hadNegativeBalance
          ? '✅ Payment Successful + Negative Balance Cleared!'
          : '✅ Payment Successful!',
        message: hadNegativeBalance
          ? `Thanks for riding with RIDEN. Your payment of $${actualAmount} was completed successfully and your negative balance has been cleared. Receipt is available in your ride history.`
          : `Thanks for riding with RIDEN. Your payment of $${actualAmount} was completed successfully. Receipt is available in your ride history.`,
        module: 'payment',
        metadata: ride,
        type: 'ALERT',
        actionLink: `${env.FRONTEND_URL}/ride?rideId=${ride._id}`,
      }),
      notifyUser({
        userId: driver.userId,
        title: '💰 Payment Received',
        message: `You've received $${amount} for your recent ride.`,
        module: 'payment',
        metadata: ride,
        type: 'ALERT',
        actionLink: `${env.FRONTEND_URL}/ride?rideId=${ride._id}`,
      }),
    ]);

    if (notify.status === 'rejected' || notifyDriver.status === 'rejected') {
      console.log('Failed to send notification');
    }

    // Get the transaction for return value
    const transaction = await TransactionModel.findOne({
      rideId: ride._id,
      type: 'DEBIT',
      for: 'passenger',
    });

    return {
      success: true,
      transaction,
      negativeBalanceCleared: hadNegativeBalance,
    };
  } catch (error) {
    console.error(`CARD PAYMENT FAILED: ${error.message}`);

    // Check if it's an insufficient funds error
    const isInsufficientFunds =
      error.message.includes('insufficient_funds') ||
      error.message.includes('card_declined') ||
      error.type === 'StripeCardError';

    if (isInsufficientFunds) {
      // Handle insufficient funds - add to passenger's negative balance
      return await handleInsufficientFunds(
        passenger,
        driver,
        ride,
        amount,
        actualAmount,
        category,
        error.message,
        session,
      );
    } else {
      // Regular payment failure - send normal failure notification
      try {
        await notifyUser({
          userId: passenger.userId,
          title: '❌ Payment Failed',
          message: `We couldn't complete your card payment of $${actualAmount}. ${error.message}. Please try again.`,
          module: 'payment',
          metadata: { rideId: ride?._id, error: error.message },
          type: 'ALERT',
          actionLink: `${env.FRONTEND_URL}/wallet`,
        });
      } catch (notifyErr) {
        console.error(
          'Failed to send payment failure notification:',
          notifyErr,
        );
      }

      return { success: false, error: error.message };
    }
  } finally {
    await session.endSession();
  }
};

const handleInsufficientFunds = async (
  passenger,
  driver,
  ride,
  amount,
  actualAmount,
  category,
  errorMessage,
  originalSession,
) => {
  const session = originalSession || (await mongoose.startSession());

  try {
    if (!originalSession) {
      await session.withTransaction(async () => {
        await processNegativeBalancePayment(
          passenger,
          driver,
          ride,
          amount,
          actualAmount,
          category,
          session,
        );
      });
    } else {
      // Use the existing transaction session
      await processNegativeBalancePayment(
        passenger,
        driver,
        ride,
        amount,
        actualAmount,
        category,
        session,
      );
    }

    // Send specific notification for negative balance
    await notifyUser({
      userId: passenger.userId,
      title: '⚠️ Payment Processed with Negative Balance',
      message: `Your payment of $${actualAmount} couldn't be processed. The amount has been added to your negative balance. Please settle this amount before your next ride.`,
      module: 'payment',
      metadata: {
        rideId: ride?._id,
        error: errorMessage,
        negativeBalance: actualAmount,
      },
      type: 'ALERT',
      actionLink: `${env.FRONTEND_URL}/wallet`,
    });

    // Notify driver about the payment situation
    await notifyUser({
      userId: driver.userId,
      title: '💰 Payment Received (Negative Balance)',
      message: `You've received $${amount} for your recent ride. Note: Passenger paid using negative balance.`,
      module: 'payment',
      metadata: ride,
      type: 'ALERT',
      actionLink: `${env.FRONTEND_URL}/ride?rideId=${ride._id}`,
    });

    return {
      success: true,
      transaction: null,
      negativeBalanceUsed: true,
      message:
        'Payment processed using negative balance due to insufficient funds',
    };
  } catch (negativeBalanceError) {
    console.error(
      `NEGATIVE BALANCE PROCESSING FAILED: ${negativeBalanceError.message}`,
    );

    // Send failure notification for negative balance processing
    try {
      await notifyUser({
        userId: passenger.userId,
        title: '❌ Payment Completely Failed',
        message: `We couldn't process your payment of $${actualAmount} and also failed to add it to negative balance. Please contact support.`,
        module: 'payment',
        metadata: {
          rideId: ride?._id,
          error: negativeBalanceError.message,
        },
        type: 'ALERT',
        actionLink: `${env.FRONTEND_URL}/support`,
      });
    } catch (notifyErr) {
      console.error('Failed to send final failure notification:', notifyErr);
    }

    return {
      success: false,
      error: `Payment failed and negative balance processing also failed: ${negativeBalanceError.message}`,
    };
  } finally {
    if (!originalSession) {
      await session.endSession();
    }
  }
};

const processNegativeBalancePayment = async (
  passenger,
  driver,
  ride,
  amount,
  actualAmount,
  category,
  session,
) => {
  // Validate amounts
  let parsedAmount = Number(amount);
  let parsedActualAmount = Number(actualAmount);

  // Commission calculation
  const commissionAmount = parsedActualAmount - parsedAmount;

  // 1. Get driver wallet using direct query
  const driverWallet = await DriverWallet.findOne({
    driverId: driver._id,
  }).session(session);
  if (!driverWallet) throw new Error('Driver wallet not found');

  // 2. Increase passenger's negative balance using direct update
  await PassengerWallet.findOneAndUpdate(
    { passengerId: passenger._id },
    { $inc: { negativeBalance: parsedActualAmount } },
    { session },
  );

  // 3. Handle driver balance updates using direct updates
  if (driverWallet.negativeBalance > 0) {
    const negative = driverWallet.negativeBalance;

    if (parsedAmount >= negative) {
      await DriverWallet.findOneAndUpdate(
        { driverId: driver._id },
        { $inc: { negativeBalance: -negative } },
        { session },
      );
      const remaining = parsedAmount - negative;
      if (remaining > 0) {
        await DriverWallet.findOneAndUpdate(
          { driverId: driver._id },
          { $inc: { pendingBalance: remaining } },
          { session },
        );
      }
    } else {
      await DriverWallet.findOneAndUpdate(
        { driverId: driver._id },
        { $inc: { negativeBalance: -parsedAmount } },
        { session },
      );
    }
  } else {
    await DriverWallet.findOneAndUpdate(
      { driverId: driver._id },
      { $inc: { pendingBalance: parsedAmount } },
      { session },
    );
  }

  // 4. Create transactions for negative balance payment using direct model creation
  await Promise.all([
    TransactionModel.create(
      [
        {
          passengerId: passenger._id,
          driverId: driver._id,
          rideId: ride._id,
          type: 'DEBIT',
          category: 'NEGATIVE_BALANCE',
          amount: parsedActualAmount,
          for: 'passenger',
          metadata: {
            paymentMethod: 'negative_balance',
            originalError: 'insufficient_funds',
            negativeBalance: true,
          },
          status: 'succeeded',
          referenceId: `negative_${ride._id}_${Date.now()}`,
          receiptUrl: `negative_${ride._id}`,
        },
      ],
      { session },
    ).then((res) => res[0]),

    TransactionModel.create(
      [
        {
          passengerId: passenger._id,
          driverId: driver._id,
          rideId: ride._id,
          type: 'CREDIT',
          category: 'PAYOUT',
          amount: parsedAmount,
          for: 'driver',
          metadata: {
            paymentMethod: 'negative_balance',
            negativeBalancePayment: true,
          },
          status: 'succeeded',
          referenceId: `negative_${ride._id}_${Date.now()}`,
          receiptUrl: `negative_${ride._id}`,
        },
      ],
      { session },
    ).then((res) => res[0]),

    RideTransaction.create(
      [
        {
          rideId: ride._id,
          driverId: driver._id,
          passengerId: passenger._id,
          amount: parsedActualAmount,
          commission: commissionAmount,
          discount: ride.fareBreakdown?.promoDiscount || 0,
          tip: ride.tipBreakdown?.amount || 0,
          driverEarning: parsedAmount,
          status: 'COMPLETED',
          isRefunded: false,
          payoutWeek: new Date(),
          metadata: {
            negativeBalance: true,
            originalPaymentFailed: true,
          },
        },
      ],
      { session },
    ).then((res) => res[0]),
  ]);
};

// Driver Flow

export const createDriverStripeAccount = async (user, driver) => {
  const account = await stripe.accounts.create({
    type: 'custom', // or 'express'
    country: 'CA',
    email: user.email,
    capabilities: {
      transfers: { requested: true },
      card_payments: { requested: true },
    },
  });

  await DriverModel.findByIdAndUpdate(driver._id, {
    stripeAccountId: account.id,
  });
  return account.id;
};

export const onboardDriverStripeAccount = async (
  user,
  driver,
  data,
  userIP,
) => {
  const account = await stripe.accounts.update(driver.stripeAccountId, {
    business_type: 'individual',
    business_profile: {
      mcc: '4121',
      product_description: 'Ride-hailing and transportation services',
      url: 'https://api.riden.online/api',
    },
    individual: {
      first_name: data.first_name,
      last_name: data.last_name,
      dob: data.dob,
      email: user.email,
      phone: '+14165550000',
      address: {
        line1: data.address.line1,
        city: data.address.city,
        state: data.address.state,
        postal_code: data.address.postal_code,
        country: data.address.country,
      },
      relationship: {
        title: 'Driver',
      },
    },
    tos_acceptance: {
      date: Math.floor(Date.now() / 1000),
      ip: userIP || '127.0.0.1',
    },
  });

  await DriverModel.findByIdAndUpdate(
    driver._id,
    { isVerified: true },
    { new: true },
  );

  return account.id;
};

export const uploadAdditionalDocument = async (accountId, file) => {
  const stripeFile = await stripe.files.create({
    purpose: 'identity_document',
    file: {
      data: file.buffer, // buffer from multer
      name: file.originalname, // keep the uploaded filename
      type: file.mimetype, // actual mimetype
    },
  });

  // Attach to connected account
  const account = await stripe.accounts.update(accountId, {
    individual: {
      verification: {
        additional_document: {
          // front: stripeFile.id,
          front: 'file_identity_document_success',
        },
      },
    },
  });

  return account;
};

export const uploadLicenseFront = async (accountId, file) => {
  const stripeFile = await stripe.files.create({
    purpose: 'identity_document',
    file: {
      data: file.buffer, // buffer from multer
      name: file.originalname, // keep the uploaded filename
      type: file.mimetype, // actual mimetype
    },
  });

  // Attach to connected account
  const account = await stripe.accounts.update(accountId, {
    individual: {
      verification: {
        document: {
          // front: stripeFile.id,
          front: 'file_identity_document_success',
        },
      },
    },
  });

  return account;
};

export const uploadLicenseBack = async (accountId, file) => {
  const stripeFile = await stripe.files.create({
    purpose: 'identity_document',
    file: {
      data: file.buffer, // buffer from multer
      name: file.originalname, // keep the uploaded filename
      type: file.mimetype, // actual mimetype
    },
  });

  // Attach to connected account
  const account = await stripe.accounts.update(accountId, {
    individual: {
      verification: {
        document: {
          // back: stripeFile.id,
          back: 'file_identity_document_success',
        },
      },
    },
  });

  return account;
};

export const createDriverVerification = async (driver) => {
  const session = await stripe.identity.verificationSessions.create({
    type: 'document',
    options: {
      document: {
        require_id_number: true,
        require_live_capture: true,
      },
    },
    metadata: {
      driverId: driver._id.toString(),
      accountId: driver.stripeAccountId,
    },
  });

  return {
    sessionId: session.id,
    url: session.url,
  };
};

export const findVerificationStatus = async (sessionId) => {
  const session =
    await stripe.identity.verificationSessions.retrieve(sessionId);

  return {
    status: session.status,
    verified: session.status === 'verified',
    verifiedFiles: session.verified_outputs ?? null,
    verifiedOutputs: session.verified_outputs ?? null,
  };
};

export const checkConnectedAccountStatus = async (accountId) => {
  const account = await stripe.accounts.retrieve(accountId);

  return {
    accountId: account.id,
    chargesEnabled: account.charges_enabled,
    payoutsEnabled: account.payouts_enabled,
    detailsSubmitted: account.details_submitted,
    requirements: {
      currentlyDue: account.requirements?.currently_due || [],
      eventuallyDue: account.requirements?.eventually_due || [],
      pastDue: account.requirements?.past_due || [],
      pendingVerification: account.requirements?.pending_verification || [],
      errors: account.requirements?.errors || [],
    },
  };
};

export const addDriverExternalAccount = async (driver, bankAccountData) => {
  const bankAccount = await stripe.accounts.createExternalAccount(
    driver.stripeAccountId,
    {
      external_account: bankAccountData,
    },
  );

  await saveDriverPayoutMethod(driver._id, bankAccount.id);

  const account = await getDefaultAccount(driver.stripeAccountId);
  if (!account.defaultAccountId) {
    await setDefaultAccount(driver.stripeAccountId, bankAccount.id);
  }
  return bankAccount;
};

export const getAllExternalAccounts = async (stripeAccountId) => {
  const externalAccounts =
    await stripe.accounts.listExternalAccounts(stripeAccountId);
  return externalAccounts;
};

export const getExternalAccountById = async (
  stripeAccountId,
  externalAccountId,
) => {
  const externalAccount = await stripe.accounts.retrieveExternalAccount(
    stripeAccountId,
    externalAccountId,
  );
  return externalAccount;
};

export const updateExternalAccount = async (
  stripeAccountId,
  externalAccountId,
  updates,
) => {
  const updatedAccount = await stripe.accounts.updateExternalAccount(
    stripeAccountId,
    externalAccountId,
    updates,
  );
  return updatedAccount;
};

export const deleteExternalAccount = async (
  driver,
  stripeAccountId,
  externalAccountId,
) => {
  const deletedAccount = await stripe.accounts.deleteExternalAccount(
    stripeAccountId,
    externalAccountId,
  );

  await updateDriverPayoutMethod(driver._id, externalAccountId);

  const account = await getDefaultAccount(stripeAccountId);
  if (account.defaultAccountId === externalAccountId) {
    await setDefaultAccount(stripeAccountId, null);
  }
  return deletedAccount;
};

export const setDefaultExternalAccount = async (
  stripeAccountId,
  externalAccountId,
) => {
  const updatedAccount = await stripe.accounts.updateExternalAccount(
    stripeAccountId,
    externalAccountId,
    { default_for_currency: true },
  );

  await setDefaultAccount(stripeAccountId, externalAccountId);
  return updatedAccount;
};

export const createPayoutRequest = async (driverId) => {
  const driverBalance = await getDriverBalance(driverId);
  const rides = await findDriverHistory(driverId);

  if (driverBalance.pendingBalance <= 9.99) {
    throw new Error('Unpaid balance must be at least $10');
  }

  const payoutRequest = await createInstantPayoutRequest(
    driverId,
    driverBalance.pendingBalance,
    rides.rideIds,
  );

  return payoutRequest;
};

export const payoutToDriverBank = async (driver, amount) => {
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      // Validate driver has Stripe account
      if (!driver.stripeAccountId) {
        throw new Error('Driver has no Stripe account linked');
      }

      // Validate amount
      const parsedAmount = Number(amount);
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        throw new Error('Invalid payout amount');
      }

      // Minimum payout amount
      const MIN_PAYOUT_AMOUNT = 10;
      if (parsedAmount < MIN_PAYOUT_AMOUNT) {
        throw new Error(
          `Payout amount must be greater than $${MIN_PAYOUT_AMOUNT}`,
        );
      }

      // Get driver wallet within transaction
      const wallet = await DriverWallet.findOne({
        driverId: driver._id,
      }).session(session);
      if (!wallet) {
        throw new Error('Driver wallet not found');
      }

      // Validate available balance
      if (wallet.availableBalance < MIN_PAYOUT_AMOUNT) {
        throw new Error(
          `Available balance must be greater than $${MIN_PAYOUT_AMOUNT}`,
        );
      }

      if (parsedAmount > wallet.availableBalance) {
        throw new Error('Insufficient funds for payout to driver bank account');
      }

      // Process Stripe payout
      const payout = await stripe.payouts.create(
        {
          amount: Math.round(parsedAmount * 100), // Convert to cents
          currency: 'cad',
          method: 'instant', // or 'standard' for slower payouts
        },
        {
          stripeAccount: driver.stripeAccountId,
        },
      );

      // Verify payout was created successfully
      if (!payout || payout.status === 'failed') {
        throw new Error(
          `Stripe payout failed: ${payout?.failure_message || 'Unknown error'}`,
        );
      }

      // Decrease driver's available balance
      await DriverWallet.findOneAndUpdate(
        { driverId: driver._id },
        { $inc: { availableBalance: -parsedAmount } },
        { session },
      );

      // Create payout transaction record
      await TransactionModel.create(
        [
          {
            driverId: driver._id,
            type: 'DEBIT',
            category: 'BANK_PAYOUT',
            amount: parsedAmount,
            for: 'driver',
            metadata: {
              payoutId: payout.id,
              stripeAccountId: driver.stripeAccountId,
              status: payout.status,
              method: payout.method,
            },
            status: payout.status === 'paid' ? 'succeeded' : 'pending',
            referenceId: payout.id,
            receiptUrl: payout.id,
          },
        ],
        { session },
      );

      // Create payout record for tracking
      await PayoutModel.create(
        [
          {
            driverId: driver._id,
            amount: parsedAmount,
            payoutType: 'BANK_TRANSFER',
            status: payout.status === 'paid' ? 'COMPLETED' : 'PENDING',
            payoutRequestId: payout.id,
            metadata: {
              stripePayoutId: payout.id,
              arrivalDate: payout.arrival_date,
              method: payout.method,
            },
          },
        ],
        { session },
      );
    });

    // Transaction committed successfully, send notification
    const notify = await notifyUser({
      userId: driver.userId,
      title: '💰 Payout Initiated',
      message: `Your payout of $${amount} has been successfully initiated and should arrive in your bank account within 1-2 business days.`,
      module: 'payout',
      metadata: { amount, payoutMethod: 'bank_transfer' },
      type: 'ALERT',
      actionLink: `${env.FRONTEND_URL}/driver/payouts`,
    });

    if (!notify) {
      console.log(
        'Failed to send payout notification, but payout was processed',
      );
    }

    return {
      success: true,
      payout,
      message: 'Payout initiated successfully',
    };
  } catch (error) {
    console.error(`BANK PAYOUT FAILED: ${error.message}`);

    // Send failure notification
    try {
      await notifyUser({
        userId: driver.userId,
        title: '❌ Payout Failed',
        message: `We couldn't process your payout of $${amount}. ${error.message}`,
        module: 'payout',
        metadata: { error: error.message },
        type: 'ALERT',
        actionLink: `${env.FRONTEND_URL}/driver/wallet`,
      });
    } catch (notifyErr) {
      console.error('Failed to send payout failure notification:', notifyErr);
    }

    return {
      success: false,
      error: error.message,
    };
  } finally {
    await session.endSession();
  }
};

// Admin Flow
// export const instantPayoutDriver = async (driver, requestId) => {
//   const balance = driver.balance;
//   if (balance <= 10) throw new Error('Payout must be greater than $10');

//   const transfer = await stripe.transfers.create({
//     amount: Math.round(balance * 100),
//     currency: 'cad',
//     destination: driver.stripeAccountId,
//     description: `Driver payout transfer`,
//   });

//   const payout = await stripe.payouts.create(
//     {
//       amount: Math.round(balance * 100),
//       currency: 'cad',
//     },
//     {
//       stripeAccount: driver.stripeAccountId,
//     },
//   );

//   const rides = await findDriverHistory(driver._id);
//   await updateRequestedPayoutStatus(requestId);
//   await updateInstantPayoutStatuses(driver._id);

//   await createPayout(
//     driver._id,
//     balance,
//     'INSTANT',
//     rides.rideIds.length,
//     requestId,
//     'SUCCESS',
//   );

//   await Promise.all([
//     deleteDriverHistory(driver._id),
//     decreaseDriverBalance(driver._id, balance),
//     createTransaction({
//       driverId: driver._id,
//       type: 'DEBIT',
//       category: 'INSTANT-PAYOUT',
//       amount: balance,
//       for: 'admin',
//       metadata: { transfer, payout },
//       status: 'succeeded',
//       referenceId: payout.id,
//       receiptUrl: payout.id,
//     }),
//     createTransaction({
//       driverId: driver._id,
//       type: 'CREDIT',
//       category: 'INSTANT-PAYOUT',
//       amount: balance,
//       for: 'driver',
//       metadata: { transfer, payout },
//       status: 'succeeded',
//       referenceId: payout.id,
//       receiptUrl: payout.id,
//     }),
//   ]);

//   return { transfer, payout };
// };

export const transferToDriverAccount = async (driver, requestId) => {
  if (!driver.stripeAccountId)
    throw new Error('Driver has no Stripe account linked');

  const wallet = await getDriverBalance(driver._id);
  if (wallet.pendingBalance <= 10)
    throw new Error('Transfer amount must be greater than $10');

  const transfer = await stripe.transfers.create({
    amount: Math.round(wallet.pendingBalance * 100),
    currency: 'cad',
    destination: driver.stripeAccountId,
    description: `Driver payout transfer`,
  });

  if (transfer.id) {
    await increaseDriverAvailableBalance(driver._id, wallet.pendingBalance);
    await decreaseDriverPendingBalance(driver._id, wallet.pendingBalance);
  }

  await updateRequestedPayoutStatus(requestId);
  await updateInstantPayoutStatuses(driver._id);

  const { weekStart, weekEnd } = getWeekRange(new Date());

  await createDriverPayout({
    driverId: driver._id,
    weekStart,
    weekEnd,
    totalEarning: wallet.pendingBalance,
    totalPaid: wallet.pendingBalance,
    status: 'paid',
    payoutMethod: 'instant',
    payoutDate: new Date(),
    stripeTransferId: transfer.id,
  });

  await Promise.all([
    createTransaction({
      driverId: driver._id,
      type: 'DEBIT',
      category: 'INSTANT-PAYOUT',
      amount: wallet.pendingBalance,
      for: 'admin',
      metadata: { transfer },
      status: 'succeeded',
      referenceId: transfer.id,
      receiptUrl: transfer.id,
    }),
    createTransaction({
      driverId: driver._id,
      type: 'CREDIT',
      category: 'INSTANT-PAYOUT',
      amount: wallet.pendingBalance,
      for: 'driver',
      metadata: { transfer },
      status: 'succeeded',
      referenceId: transfer.id,
      receiptUrl: transfer.id,
    }),
  ]);

  return transfer;
};

export const refundCardPaymentToPassenger = async (
  rideId,
  reason = 'requested_by_customer',
) => {
  const session = await mongoose.startSession();

  try {
    let stripeErrorOccurred = false;
    let refund;

    await session.withTransaction(async () => {
      // 1. Find and mark transactions as refunded atomically
      const [
        driverCreditTx,
        passengerDebitTx,
        adminCommission,
        rideTransaction,
      ] = await Promise.all([
        TransactionModel.findOneAndUpdate(
          {
            rideId,
            type: 'CREDIT',
            status: 'succeeded',
            for: 'driver',
            isRefunded: false,
          },
          { isRefunded: true },
          { new: true, session },
        ),
        TransactionModel.findOneAndUpdate(
          {
            rideId,
            type: 'DEBIT',
            status: 'succeeded',
            for: 'passenger',
            isRefunded: false,
          },
          { isRefunded: true },
          { new: true, session },
        ),
        AdminCommission.findOneAndUpdate(
          { rideId, isRefunded: false },
          { isRefunded: true },
          { new: true, session },
        ),
        RideTransaction.findOneAndUpdate(
          { rideId, isRefunded: false, status: 'COMPLETED' },
          { isRefunded: true, status: 'REFUNDED' },
          { new: true, session },
        ),
      ]);

      if (!passengerDebitTx) {
        throw new Error('Original payment not found or already refunded');
      }
      if (!adminCommission) {
        throw new Error('Admin commission not found or already refunded');
      }
      if (!rideTransaction) {
        throw new Error('Ride transaction not found or already refunded');
      }

      const {
        passengerId,
        driverId,
        amount: actualAmountPaid,
        referenceId,
      } = passengerDebitTx;
      const driverAmountReceived = driverCreditTx?.amount || actualAmountPaid;

      // 2. Get entities within transaction using direct queries
      const [passenger, driver, ride, driverWallet] = await Promise.all([
        PassengerModel.findById(passengerId).session(session),
        DriverModel.findById(driverId).session(session),
        RideModel.findById(rideId).session(session),
        DriverWallet.findOne({ driverId: driverId }).session(session),
      ]);

      if (!passenger || !driver)
        throw new Error('Passenger or Driver not found');
      if (!driverWallet) throw new Error('Driver wallet not found');

      // 3. Check if already refunded in Stripe before processing
      try {
        // First, check if refund already exists
        const existingRefunds = await stripe.refunds.list({
          payment_intent: referenceId,
        });

        if (existingRefunds.data.length > 0 && existingRefunds.data[0].status === 'succeeded') {
          // Use existing refund
          refund = existingRefunds.data[0];
          console.log('Using existing Stripe refund:', refund.id);
        } else {
          // Process new refund
          refund = await stripe.refunds.create({
            payment_intent: referenceId,
            amount: actualAmountPaid * 100, // Refund full amount passenger paid
            reason: 'requested_by_customer',
          });

          if (!refund || refund.status !== 'succeeded') {
            throw new Error('Stripe refund failed');
          }
        }
      } catch (error) {
        if (error.message.includes('already been refunded')) {
          // If already refunded, we still need to process our internal refund
          console.log('Charge already refunded in Stripe, processing internal refund only');
          stripeErrorOccurred = true;
          refund = { 
            id: `already_refunded_${Date.now()}`, 
            status: 'succeeded',
            receipt_url: null 
          };
        } else {
          throw error;
        }
      }

      // 4. Adjust driver balances using direct updates
      let refundRemaining = driverAmountReceived;

      if (driverWallet.pendingBalance > 0) {
        const pendingUsed = Math.min(
          driverWallet.pendingBalance,
          refundRemaining,
        );
        await DriverWallet.findOneAndUpdate(
          { driverId: driver._id },
          { $inc: { pendingBalance: -pendingUsed } },
          { session }
        );
        refundRemaining -= pendingUsed;
      }

      if (refundRemaining > 0) {
        await DriverWallet.findOneAndUpdate(
          { driverId: driver._id },
          { $inc: { negativeBalance: refundRemaining } },
          { session }
        );
      }

      // 5. Log refund transactions atomically using direct model creation
      await Promise.all([
        TransactionModel.create([{
          passengerId,
          driverId,
          rideId,
          type: 'CREDIT',
          category: 'REFUND',
          amount: actualAmountPaid, // Full refund to passenger
          for: 'passenger',
          metadata: { 
            ...refund, 
            alreadyRefunded: stripeErrorOccurred,
            originalReferenceId: referenceId
          },
          status: 'succeeded',
          referenceId: refund.id,
          receiptUrl: refund.receipt_url || refund.id,
        }], { session }).then(res => res[0]),
        
        TransactionModel.create([{
          passengerId,
          driverId,
          rideId,
          type: 'DEBIT',
          category: 'REFUND',
          amount: driverAmountReceived, // Only what driver received
          for: 'driver',
          metadata: { 
            ...refund, 
            alreadyRefunded: stripeErrorOccurred,
            originalReferenceId: referenceId
          },
          status: 'succeeded',
          referenceId: refund.id,
          receiptUrl: refund.receipt_url || refund.id,
        }], { session }).then(res => res[0]),
        
        RefundTransaction.create([{
          rideId: ride._id,
          passengerId: passenger._id,
          driverId: driver._id,
          refundAmount: actualAmountPaid,
          refundReason: reason,
          driverDeducted: driverAmountReceived,
          commissionRefunded: adminCommission.commissionAmount,
          resolvedBy: 'admin',
          metadata: {
            stripeRefundId: refund.id,
            alreadyRefunded: stripeErrorOccurred
          }
        }], { session }).then(res => res[0]),
      ]);
    });

    // Transaction committed successfully, now send notifications
    const [passengerDebitTx, adminCommission, ride] = await Promise.all([
      TransactionModel.findOne({
        rideId,
        type: 'DEBIT',
        isRefunded: true,
      }),
      AdminCommission.findOne({ rideId, isRefunded: true }),
      RideModel.findById(rideId),
    ]);

    if (!passengerDebitTx || !adminCommission || !ride) {
      throw new Error('Failed to retrieve refunded records');
    }

    const {
      passengerId,
      driverId,
      amount: actualAmountPaid,
    } = passengerDebitTx;
    
    const [passenger, driver] = await Promise.all([
      PassengerModel.findById(passengerId),
      DriverModel.findById(driverId),
    ]);

    if (!passenger || !driver) {
      throw new Error('Passenger or driver not found for notification');
    }

    const driverCreditTx = await TransactionModel.findOne({
      rideId,
      type: 'CREDIT',
      for: 'driver',
      isRefunded: true,
    });

    const refundAmount = actualAmountPaid;
    const driverDeducted = driverCreditTx?.amount || actualAmountPaid;

    // 6. Notify both users
    await Promise.allSettled([
      notifyUser({
        userId: passenger.userId,
        title: '💸 Refund Issued',
        message: `A refund of $${refundAmount} has been processed for your ride.`,
        module: 'refund',
        metadata: { rideId, reason, refundId: refund.id },
        type: 'ALERT',
        actionLink: `${env.FRONTEND_URL}/ride?rideId=${rideId}`,
      }),
      notifyUser({
        userId: driver.userId,
        title: '⚠️ Refund Deducted',
        message: `A refund of $${driverDeducted} has been deducted for ride ${rideId}. Reason: ${reason}.`,
        module: 'refund',
        metadata: { rideId, reason, refundId: refund.id },
        type: 'ALERT',
        actionLink: `${env.FRONTEND_URL}/ride?rideId=${rideId}`,
      }),
    ]);

    return {
      success: true,
      message: 'Refund processed successfully',
      refundId: refund.id,
      alreadyRefunded: stripeErrorOccurred
    };
  } catch (error) {
    console.error(`STRIPE REFUND FAILED: ${error.message}`);

    // Failure Notification
    try {
      const passengerDebitTx = await TransactionModel.findOne({
        rideId,
        type: 'DEBIT',
        isRefunded: false,
      });

      if (passengerDebitTx) {
        const passenger = await PassengerModel.findById(passengerDebitTx.passengerId);
        if (passenger) {
          await notifyUser({
            userId: passenger.userId,
            title: '❌ Refund Failed',
            message: `We couldn't process your refund. ${error.message}`,
            module: 'refund',
            metadata: { rideId, error: error.message },
            type: 'ALERT',
            actionLink: `${env.FRONTEND_URL}/support`,
          });
        }
      }
    } catch (notifyErr) {
      console.error('Failed to send refund failure notification:', notifyErr);
    }

    return { success: false, error: error.message };
  } finally {
    await session.endSession();
  }
};

export const refundWalletPaymentToPassenger = async (
  rideId,
  reason = 'requested_by_customer',
) => {
  const session = await mongoose.startSession();

  try {
    // First, check if transactions exist and are refundable
    const [existingDebitTx, existingCreditTx, existingAdminCommission, existingRideTransaction] = await Promise.all([
      TransactionModel.findOne({
        rideId,
        type: 'DEBIT',
        status: 'succeeded',
        for: 'passenger',
        isRefunded: false,
      }),
      TransactionModel.findOne({
        rideId,
        type: 'CREDIT',
        status: 'succeeded', 
        for: 'driver',
        isRefunded: false,
      }),
      AdminCommission.findOne({
        rideId,
        isRefunded: false,
      }),
      RideTransaction.findOne({
        rideId,
        isRefunded: false,
        status: 'COMPLETED'
      })
    ]);

    // Detailed error messages
    if (!existingDebitTx) {
      const alreadyRefunded = await TransactionModel.findOne({
        rideId,
        type: 'DEBIT',
        isRefunded: true,
      });
      
      if (alreadyRefunded) {
        throw new Error('Payment already refunded');
      } else {
        throw new Error('Original payment transaction not found');
      }
    }

    if (!existingCreditTx) {
      throw new Error('Driver payout transaction not found');
    }

    if (!existingAdminCommission) {
      throw new Error('Admin commission record not found');
    }

    if (!existingRideTransaction) {
      throw new Error('Ride transaction not found or already refunded');
    }

    await session.withTransaction(async () => {
      // 1. Find and mark transactions as refunded atomically
      const [driverCreditTx, originalTx, adminCommission, rideTransaction] =
        await Promise.all([
          TransactionModel.findOneAndUpdate(
            {
              rideId,
              type: 'CREDIT',
              status: 'succeeded',
              for: 'driver',
              isRefunded: false,
            },
            { isRefunded: true },
            { new: true, session },
          ),
          TransactionModel.findOneAndUpdate(
            {
              rideId,
              type: 'DEBIT',
              status: 'succeeded',
              for: 'passenger',
              isRefunded: false,
            },
            { isRefunded: true },
            { new: true, session },
          ),
          AdminCommission.findOneAndUpdate(
            { rideId, isRefunded: false },
            { isRefunded: true },
            { new: true, session },
          ),
          RideTransaction.findOneAndUpdate(
            { rideId, isRefunded: false, status: 'COMPLETED' },
            { isRefunded: true, status: 'REFUNDED' },
            { new: true, session },
          ),
        ]);

      // These should not fail since we checked above
      if (!originalTx) throw new Error('Failed to mark original payment as refunded');
      if (!adminCommission) throw new Error('Failed to mark admin commission as refunded');
      if (!rideTransaction) throw new Error('Failed to mark ride transaction as refunded');

      const { passengerId, driverId, amount } = originalTx;

      // 2. Get entities within transaction using direct queries
      const [passenger, driver, ride, passengerWallet, driverWallet] =
        await Promise.all([
          PassengerModel.findById(passengerId).session(session),
          DriverModel.findById(driverId).session(session),
          RideModel.findById(rideId).session(session),
          PassengerWallet.findOne({ passengerId }).session(session),
          DriverWallet.findOne({ driverId }).session(session),
        ]);

      if (!passenger) throw new Error('Passenger not found');
      if (!driver) throw new Error('Driver not found');
      if (!passengerWallet) throw new Error('Passenger wallet not found');
      if (!driverWallet) throw new Error('Driver wallet not found');
      if (!ride) throw new Error('Ride not found');

      // 3. Refund logic using direct balance updates
      let refundRemaining = amount;

      if (driverWallet.pendingBalance > 0) {
        const pendingUsed = Math.min(
          driverWallet.pendingBalance,
          refundRemaining,
        );
        await DriverWallet.findOneAndUpdate(
          { driverId: driver._id },
          { $inc: { pendingBalance: -pendingUsed } },
          { session }
        );
        refundRemaining -= pendingUsed;
      }

      if (refundRemaining > 0) {
        await DriverWallet.findOneAndUpdate(
          { driverId: driver._id },
          { $inc: { negativeBalance: refundRemaining } },
          { session }
        );
      }

      // 4. Credit passenger wallet using direct update
      const refundAmount = amount + adminCommission.commissionAmount;
      await PassengerWallet.findOneAndUpdate(
        { passengerId: passenger._id },
        { $inc: { availableBalance: refundAmount } },
        { session }
      );

      // 5. Log refund transactions atomically using direct model creation
      await Promise.all([
        TransactionModel.create([{
          passengerId,
          driverId,
          rideId,
          walletId: passengerWallet._id,
          type: 'CREDIT',
          category: 'REFUND',
          amount: refundAmount,
          for: 'passenger',
          metadata: { 
            reason, 
            originalTransactionId: originalTx._id,
            commissionRefunded: adminCommission.commissionAmount,
            refundType: 'WALLET_REFUND'
          },
          status: 'succeeded',
          referenceId: `wallet_refund_${rideId}_${Date.now()}`,
          receiptUrl: passengerWallet._id,
        }], { session }).then(res => res[0]),
        
        TransactionModel.create([{
          passengerId,
          driverId,
          rideId,
          walletId: driverWallet._id,
          type: 'DEBIT',
          category: 'REFUND',
          amount: refundAmount,
          for: 'driver',
          metadata: { 
            reason, 
            originalTransactionId: driverCreditTx?._id,
            amountDeducted: amount,
            commissionRefunded: adminCommission.commissionAmount,
            refundType: 'WALLET_REFUND'
          },
          status: 'succeeded',
          referenceId: `wallet_refund_${rideId}_${Date.now()}`,
          receiptUrl: driverWallet._id,
        }], { session }).then(res => res[0]),
        
        RefundTransaction.create([{
          rideId: ride._id,
          passengerId: passenger._id,
          driverId: driver._id,
          refundAmount: refundAmount,
          refundReason: reason,
          driverDeducted: amount,
          commissionRefunded: adminCommission.commissionAmount,
          resolvedBy: 'admin',
          metadata: {
            refundType: 'WALLET_REFUND',
            originalAmount: amount
          }
        }], { session }).then(res => res[0]),
      ]);
    });

    // Transaction committed successfully, now send notifications
    const [originalTx, adminCommission, ride] = await Promise.all([
      TransactionModel.findOne({
        rideId,
        type: 'DEBIT',
        isRefunded: true,
      }),
      AdminCommission.findOne({ rideId, isRefunded: true }),
      RideModel.findById(rideId),
    ]);

    if (!originalTx || !adminCommission || !ride) {
      throw new Error('Failed to retrieve refunded records for notification');
    }

    const { passengerId, driverId, amount } = originalTx;
    const [passenger, driver] = await Promise.all([
      PassengerModel.findById(passengerId),
      DriverModel.findById(driverId),
    ]);

    if (!passenger || !driver) {
      throw new Error('Passenger or driver not found for notification');
    }

    const refundAmount = amount + adminCommission.commissionAmount;

    // 6. Notify both users (outside transaction)
    await Promise.allSettled([
      notifyUser({
        userId: passenger.userId,
        title: '💸 Refund Processed',
        message: `Your refund of PKR ${refundAmount} for ride ${ride.rideId} has been processed successfully.`,
        module: 'refund',
        metadata: { ride, reason, refundAmount },
        type: 'ALERT',
        actionLink: `${env.FRONTEND_URL}/wallet`,
      }),
      notifyUser({
        userId: driver.userId,
        title: '⚠️ Refund Deducted',
        message: `A refund of PKR ${amount} has been deducted for ride ${ride.rideId}. Reason: ${reason}.`,
        module: 'refund',
        metadata: { ride, reason, amountDeducted: amount },
        type: 'ALERT',
        actionLink: `${env.FRONTEND_URL}/rides/${rideId}`,
      }),
    ]);

    return { 
      success: true, 
      message: 'Refund completed successfully',
      refundAmount,
      amountDeductedFromDriver: amount
    };
  } catch (error) {
    console.error(`WALLET REFUND FAILED: ${error.message}`);

    // Send failure notification
    try {
      const originalTx = await TransactionModel.findOne({ 
        rideId, 
        type: 'DEBIT', 
        isRefunded: false 
      });
      
      if (originalTx) {
        const passenger = await PassengerModel.findById(originalTx.passengerId);
        if (passenger) {
          await notifyUser({
            userId: passenger.userId,
            title: '❌ Refund Failed',
            message: `We couldn't process your refund. ${error.message}`,
            module: 'refund',
            metadata: { rideId, error: error.message },
            type: 'ALERT',
            actionLink: `${env.FRONTEND_URL}/support`,
          });
        }
      }
    } catch (notifyErr) {
      console.error('Failed to send refund failure notification:', notifyErr);
    }

    return { success: false, error: error.message };
  } finally {
    await session.endSession();
  }
};
