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
import User from '../models/User.js';
import env from '../config/envConfig.js';
import { notifyUser } from '../dal/notification.js';
import { sendDriverPaymentProcessedEmail } from '../templates/emails/user/index.js';
import { createAdminNotification } from './notification.js';
import { CARD_TYPES, PAYMENT_METHODS } from '../enums/paymentEnums.js';

const stripe = new Stripe(env.STRIPE_SECRET_KEY);

/**
 * Helper function to ensure payment method is attached to customer
 * Handles cases where payment method was previously used without attachment
 * Returns the payment method ID to use (may be different if fallback is used)
 */
export const ensurePaymentMethodAttached = async (
  stripeCustomerId,
  paymentMethodId,
) => {
  try {
    // Retrieve payment method
    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);

    // Check if payment method is attached to the correct customer
    if (paymentMethod.customer === stripeCustomerId) {
      // Already attached to correct customer
      return { success: true, paymentMethodId, isAttached: true };
    }

    // If not attached or attached to different customer
    if (!paymentMethod.customer) {
      // Try to attach payment method to customer
      try {
        await stripe.paymentMethods.attach(paymentMethodId, {
          customer: stripeCustomerId,
        });
        return { success: true, paymentMethodId, isAttached: true };
      } catch (attachError) {
        // If payment method was previously used without attachment, it cannot be reused
        if (
          attachError.message.includes('previously used') ||
          attachError.message.includes('may not be used again') ||
          attachError.message.includes('detached from a Customer')
        ) {
          // Try to use customer's default payment method as fallback
          const customer = await stripe.customers.retrieve(stripeCustomerId);
          const defaultPaymentMethodId =
            customer.invoice_settings?.default_payment_method;

          if (defaultPaymentMethodId) {
            console.log(
              `Payment method ${paymentMethodId} cannot be attached. Using default payment method ${defaultPaymentMethodId} instead.`,
            );
            return {
              success: true,
              paymentMethodId: defaultPaymentMethodId,
              isAttached: true,
              usedFallback: true,
            };
          }

          throw new Error(
            'This payment method was previously used and cannot be reused. Please add a new payment method.',
          );
        }
        throw attachError;
      }
    } else {
      // Payment method is attached to a different customer
      // Try to use customer's default payment method as fallback
      const customer = await stripe.customers.retrieve(stripeCustomerId);
      const defaultPaymentMethodId =
        customer.invoice_settings?.default_payment_method;

      if (defaultPaymentMethodId) {
        console.log(
          `Payment method ${paymentMethodId} belongs to different customer. Using default payment method ${defaultPaymentMethodId} instead.`,
        );
        return {
          success: true,
          paymentMethodId: defaultPaymentMethodId,
          isAttached: true,
          usedFallback: true,
        };
      }

      throw new Error(
        'This payment method belongs to a different customer. Please use a different payment method.',
      );
    }
  } catch (error) {
    console.error(
      `Error ensuring payment method attachment for ${paymentMethodId}:`,
      error.message,
    );
    return {
      success: false,
      error: error.message || 'Failed to ensure payment method attachment',
    };
  }
};

const sanitizeMetadataValue = (value, maxLength = 500) => {
  if (value === null || value === undefined) {
    return '';
  }

  // Handle ObjectId or populated Mongoose objects
  if (mongoose.Types.ObjectId.isValid(value)) {
    return value.toString();
  }

  // If it's an object with _id, extract the _id
  if (value && typeof value === 'object' && value._id) {
    return value._id.toString();
  }

  // Convert to string
  const stringValue = String(value);

  // Truncate if exceeds max length
  if (stringValue.length > maxLength) {
    return stringValue.substring(0, maxLength);
  }

  return stringValue;
};

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

export const getDriverBalance = async (driverId) =>
  DriverWallet.findOne({ driverId });

export const getDriverTodayEarnings = async (driverId) => {
  const today = new Date();
  const startOfDay = new Date(today);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(today);
  endOfDay.setHours(23, 59, 59, 999);

  // Debug: Log query parameters
  console.log('🔍 [getDriverTodayEarnings] Debug Info:');
  console.log('  DriverId:', driverId);
  console.log('  Start of Day:', startOfDay.toISOString());
  console.log('  End of Day:', endOfDay.toISOString());

  const query = {
    driverId,
    status: 'succeeded',
    isRefunded: false,
    type: 'CREDIT', // Driver earnings are CREDIT (money added to driver)
    category: { $in: ['PAYOUT', 'TIP'] }, // Driver earnings from rides (PAYOUT) and tips (TIP)
    for: 'driver', // Transactions for driver
    createdAt: { $gte: startOfDay, $lte: endOfDay },
  };

  console.log('  Query:', JSON.stringify(query, null, 2));

  // Check total transactions for this driver (any date)
  const totalDriverTransactions = await TransactionModel.countDocuments({
    driverId,
    type: 'CREDIT',
    for: 'driver',
  });
  console.log('  Total driver CREDIT transactions (all time):', totalDriverTransactions);

  // Check today's transactions without filters
  const todayTransactionsCount = await TransactionModel.countDocuments({
    driverId,
    createdAt: { $gte: startOfDay, $lte: endOfDay },
  });
  console.log('  Today\'s transactions (any type/category):', todayTransactionsCount);

  // Check with each filter separately
  const withStatusFilter = await TransactionModel.countDocuments({
    driverId,
    status: 'succeeded',
    createdAt: { $gte: startOfDay, $lte: endOfDay },
  });
  console.log('  Today\'s transactions (status=succeeded):', withStatusFilter);

  const withTypeFilter = await TransactionModel.countDocuments({
    driverId,
    type: 'CREDIT',
    createdAt: { $gte: startOfDay, $lte: endOfDay },
  });
  console.log('  Today\'s transactions (type=CREDIT):', withTypeFilter);

  const withCategoryFilter = await TransactionModel.countDocuments({
    driverId,
    category: { $in: ['PAYOUT', 'TIP'] },
    createdAt: { $gte: startOfDay, $lte: endOfDay },
  });
  console.log('  Today\'s transactions (category=PAYOUT|TIP):', withCategoryFilter);

  const withForFilter = await TransactionModel.countDocuments({
    driverId,
    for: 'driver',
    createdAt: { $gte: startOfDay, $lte: endOfDay },
  });
  console.log('  Today\'s transactions (for=driver):', withForFilter);

  // Execute main query
  const transactions = await TransactionModel.find(query)
    .select('amount category type status createdAt')
    .lean();

  console.log('  Found transactions:', transactions.length);
  if (transactions.length > 0) {
    console.log('  Transaction details:', JSON.stringify(transactions, null, 2));
  }

  const balance = transactions.reduce((acc, curr) => acc + curr.amount, 0);
  console.log('  Calculated balance:', balance);

  return {
    balance,
  };
};

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

// Instant payout with fee (e.g. 3%).
// - If overrideAmount provided: uses that gross amount (for example, unpaid earnings).
// - Otherwise: uses driver's available wallet balance.
// Sends (gross - fee) to driver's bank via Stripe payout,
// and deducts the full gross (net + fee) from the wallet.
export const processInstantPayoutWithFee = async (
  driver,
  feePercent = 3,
  overrideAmount = null,
) => {
  const session = await mongoose.startSession();

  try {
    let result;

    await session.withTransaction(async () => {
      if (!driver.stripeAccountId) {
        throw new Error('Driver has no Stripe account linked');
      }

      const wallet = await DriverWallet.findOne({
        driverId: driver._id,
      }).session(session);

      if (!wallet) {
        throw new Error('Driver wallet not found');
      }

      const baseAmount =
        overrideAmount !== null && overrideAmount !== undefined
          ? overrideAmount
          : wallet.availableBalance;

      const grossAmount = Number(baseAmount || 0);
      if (isNaN(grossAmount) || grossAmount <= 0) {
        throw new Error('No available balance for instant payout');
      }

      const MIN_PAYOUT_AMOUNT = 10;
      if (grossAmount < MIN_PAYOUT_AMOUNT) {
        throw new Error(
          `Instant payout amount must be at least $${MIN_PAYOUT_AMOUNT}`,
        );
      }

      const feeRate = Number(feePercent) / 100;
      const feeAmount = +(grossAmount * feeRate).toFixed(2);
      const netAmount = +(grossAmount - feeAmount).toFixed(2);

      if (netAmount <= 0) {
        throw new Error('Instant payout amount is too low after fee');
      }

      // Check if driver's default payout method supports instant payouts
      // In Canada, instant payouts only work with debit cards, not bank accounts
      const externalAccountsResult = await getAllExternalAccounts(
        driver.stripeAccountId,
      );
      if (!externalAccountsResult.success) {
        throw new Error(
          'Failed to verify payout method. Please ensure you have a payout method added.',
        );
      }

      const defaultAccount = externalAccountsResult.accounts.find(
        (account) => account.default_for_currency === true,
      );

      if (!defaultAccount) {
        throw new Error(
          'No default payout method found. Please set a default payout method first.',
        );
      }

      // Check if default account is a bank account (not supported for instant payouts in Canada)
      if (defaultAccount.object === 'bank_account') {
        throw new Error(
          'Instant payouts to bank accounts are not supported for accounts based in Canada. Please add a debit card as your default payout method to use instant payouts. See: https://stripe.com/docs/payouts/instant-payouts-banks',
        );
      }

      // If it's a card, proceed with instant payout
      if (defaultAccount.object !== 'card') {
        throw new Error(
          `Unsupported payout method type: ${defaultAccount.object}. Instant payouts require a debit card.`,
        );
      }

      // Create Stripe payout for the net amount
      const payout = await stripe.payouts.create(
        {
          amount: Math.round(netAmount * 100),
          currency: 'cad',
          method: 'instant',
        },
        {
          stripeAccount: driver.stripeAccountId,
        },
      );

      if (!payout || payout.status === 'failed') {
        throw new Error(
          `Stripe payout failed: ${payout?.failure_message || 'Unknown error'}`,
        );
      }

      // Deduct full gross amount (net + fee) from driver's available balance.
      // If overrideAmount is used and wallet.availableBalance is lower,
      // we still deduct from availableBalance up to its value, and leave the
      // rest in negativeBalance handling for future adjustments.
      await DriverWallet.findOneAndUpdate(
        { driverId: driver._id },
        { $inc: { availableBalance: -grossAmount } },
        { session },
      );

      // Create transaction for driver (debit = payout to bank)
      const [driverTx, feeTx] = await TransactionModel.create(
        [
          {
            driverId: driver._id,
            type: 'DEBIT',
            category: 'INSTANT-PAYOUT',
            amount: netAmount,
            for: 'driver',
            metadata: {
              payoutId: payout.id,
              stripeAccountId: driver.stripeAccountId,
              status: payout.status,
              method: payout.method,
              feePercent,
              feeAmount,
              grossAmount,
            },
            status: payout.status === 'paid' ? 'succeeded' : 'pending',
            referenceId: payout.id,
          },
          {
            driverId: driver._id,
            type: 'DEBIT',
            category: 'INSTANT-PAYOUT',
            amount: feeAmount,
            for: 'driver',
            metadata: {
              payoutId: payout.id,
              stripeAccountId: driver.stripeAccountId,
              status: payout.status,
              method: payout.method,
              feePercent,
              description: 'Instant payout fee',
            },
            status: payout.status === 'paid' ? 'succeeded' : 'pending',
            referenceId: `${payout.id}_fee`,
          },
        ],
        { session },
      );

      result = {
        success: true,
        payoutId: payout.id,
        status: payout.status,
        currency: payout.currency,
        grossAmount,
        feePercent,
        feeAmount,
        netAmount,
        transactions: {
          driverPayoutTransactionId: driverTx._id,
          feeTransactionId: feeTx._id,
        },
      };
    });

    return result;
  } catch (error) {
    console.error('STRIPE INSTANT PAYOUT ERROR:', error);
    throw error;
  } finally {
    await session.endSession();
  }
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

export const cardSetupIntent = async (stripeCustomerId) => {
  try {
    const setupIntent = await stripe.setupIntents.create({
      customer: stripeCustomerId,
      payment_method_types: ['card'],
    });

    return {
      clientSecret: setupIntent.client_secret,
    };
  } catch (error) {
    console.error(`STRIPE ERROR: ${error}`);
    return {
      success: false,
      error: error.message || 'Failed to create setup intent',
    };
  }
};

export const addPassengerCard = async (
  stripeCustomerId,
  paymentMethodId,
  metadata = {},
) => {
  try {
    // Attach payment method to customer
    await stripe.paymentMethods.attach(paymentMethodId, {
      customer: stripeCustomerId,
    });

    // Update payment method with metadata
    if (Object.keys(metadata).length > 0) {
      await stripe.paymentMethods.update(paymentMethodId, {
        metadata: {
          ...metadata,
        },
      });
    }

    // Check if customer has a default payment method
    const customer = await stripe.customers.retrieve(stripeCustomerId);
    const defaultPaymentMethodId =
      customer.invoice_settings.default_payment_method;

    // If no default card exists, set the newly added card as default
    if (!defaultPaymentMethodId) {
      await stripe.customers.update(stripeCustomerId, {
        invoice_settings: {
          default_payment_method: paymentMethodId,
        },
      });
    }

    return { success: true, paymentMethodId };
  } catch (error) {
    console.error(`STRIPE ERROR: ${error}`);
    return {
      success: false,
      error: error.message || 'Failed to attach payment method',
    };
  }
};

export const getPassengerCards = async (stripeCustomerId) => {
  try {
    const customer = await stripe.customers.retrieve(stripeCustomerId);
    const defaultPaymentMethodId =
      customer.invoice_settings.default_payment_method;

    const paymentMethods = await stripe.paymentMethods.list({
      customer: stripeCustomerId,
      type: 'card',
    });

    const cards = paymentMethods.data.map((card) => ({
      ...card,
      isDefault: card.id === defaultPaymentMethodId,
    }));

    return {
      success: true,
      cards,
    };
  } catch (error) {
    console.error('STRIPE ERROR:', error.message);
    return {
      success: false,
      error: error.message,
    };
  }
};

export const getPassengerCardById = async (
  stripeCustomerId,
  paymentMethodId,
) => {
  try {
    if (!stripeCustomerId) {
      return {
        success: false,
        error: 'Stripe customer ID is required',
      };
    }

    if (!paymentMethodId) {
      return {
        success: false,
        error: 'Payment method ID is required',
      };
    }

    // Retrieve the payment method
    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);

    // Verify the payment method belongs to this customer
    if (paymentMethod.customer !== stripeCustomerId) {
      return {
        success: false,
        error: 'Payment method does not belong to this customer',
      };
    }

    // Get customer to check if this is the default payment method
    const customer = await stripe.customers.retrieve(stripeCustomerId);
    const defaultPaymentMethodId =
      customer.invoice_settings.default_payment_method;

    return {
      success: true,
      card: {
        ...paymentMethod,
        isDefault: paymentMethod.id === defaultPaymentMethodId,
      },
    };
  } catch (error) {
    console.error('STRIPE ERROR:', error.message);
    return {
      success: false,
      error: error.message || 'Failed to fetch payment method',
    };
  }
};

export const deletePassengerCard = async (
  stripeCustomerId,
  paymentMethodId,
) => {
  try {
    if (!stripeCustomerId) {
      return {
        success: false,
        error: 'Stripe customer ID is required',
      };
    }

    if (!paymentMethodId) {
      return {
        success: false,
        error: 'Payment method ID is required',
      };
    }

    // Get customer to check if this is the default payment method
    const customer = await stripe.customers.retrieve(stripeCustomerId);
    const defaultPaymentMethodId =
      customer.invoice_settings.default_payment_method;
    const isDeletingDefault = defaultPaymentMethodId === paymentMethodId;

    // Retrieve the payment method to verify ownership
    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);

    // Verify the payment method belongs to this customer
    if (paymentMethod.customer !== stripeCustomerId) {
      return {
        success: false,
        error: 'Payment method does not belong to this customer',
      };
    }

    // Detach the payment method from the customer
    const detached = await stripe.paymentMethods.detach(paymentMethodId);

    // If we deleted the default card, set a new default if available
    if (isDeletingDefault) {
      // Get remaining payment methods
      const remainingPaymentMethods = await stripe.paymentMethods.list({
        customer: stripeCustomerId,
        type: 'card',
      });

      if (remainingPaymentMethods.data.length > 0) {
        // Set the first remaining card as default
        const newDefaultPaymentMethodId = remainingPaymentMethods.data[0].id;
        await stripe.customers.update(stripeCustomerId, {
          invoice_settings: {
            default_payment_method: newDefaultPaymentMethodId,
          },
        });
      }
      // If no cards left, Stripe will automatically clear the default
    }

    return { success: true, detached };
  } catch (error) {
    console.error(`STRIPE ERROR: ${error.message}`);
    return {
      success: false,
      error: error.message || 'Failed to delete card',
    };
  }
};

export const setDefaultPassengerCard = async (
  stripeCustomerId,
  paymentMethodId,
) => {
  try {
    const customer = await stripe.customers.update(stripeCustomerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });

    return { success: true, defaultPaymentMethod: paymentMethodId };
  } catch (error) {
    console.error('STRIPE ERROR:', error.message);
    return { success: false, error: error.message };
  }
};

export const getPassengerPaymentIntent = async (
  // stripeCustomerId,
  paymentIntentId,
) => {
  try {
    // if (!stripeCustomerId) {
    //   return {
    //     success: false,
    //     error: 'Stripe customer ID is required',
    //   };
    // }

    if (!paymentIntentId) {
      return {
        success: false,
        error: 'Payment intent ID is required',
      };
    }

    // Retrieve the payment intent from Stripe
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    // Verify the payment intent belongs to this customer
    // if (paymentIntent.customer !== stripeCustomerId) {
    //   return {
    //     success: false,
    //     error: 'Payment intent does not belong to this customer',
    //   };
    // }

    // Format the payment intent data for response
    return {
      success: true,
      paymentIntent,
    };
  } catch (error) {
    console.error('STRIPE ERROR:', error.message);
    return {
      success: false,
      error: error.message || 'Failed to fetch payment intent',
      stripeError: error.type || null,
    };
  }
};

export const setupPassengerWalletIntent = async (
  user,
  passenger,
  walletType,
) => {
  try {
    const normalizedWalletType = walletType.trim().toUpperCase();

    if (!['APPLE_PAY', 'GOOGLE_PAY'].includes(normalizedWalletType)) {
      return {
        success: false,
        error: 'Invalid wallet type. Must be APPLE_PAY or GOOGLE_PAY',
      };
    }

    if (!passenger.stripeCustomerId) {
      const customer = await stripe.customers.create({
        name: user.name,
        email: user.email,
        metadata: {
          userId: user._id.toString(),
          passengerId: passenger._id.toString(),
        },
      });

      if (!customer) {
        throw new Error('Failed to create stripe customer');
      }

      await PassengerModel.findByIdAndUpdate(passenger._id, {
        stripeCustomerId: customer.id,
      });
      passenger.stripeCustomerId = customer.id;
    }

    // Check for existing wallet payment methods
    const existingPaymentMethods = await stripe.paymentMethods.list({
      customer: passenger.stripeCustomerId,
      type: 'card',
    });

    const walletTypeToCheck =
      normalizedWalletType === 'GOOGLE_PAY' ? 'google_pay' : 'apple_pay';
    const existingWalletPM = existingPaymentMethods.data.find(
      (pm) => pm.card?.wallet?.type === walletTypeToCheck,
    );

    if (existingWalletPM) {
      return {
        success: false,
        error: `You already have a ${normalizedWalletType === 'GOOGLE_PAY' ? 'Google Pay' : 'Apple Pay'} payment method. Please remove it before adding a new one.`,
      };
    }

    // Create Setup Intent
    const setupIntent = await stripe.setupIntents.create({
      customer: passenger.stripeCustomerId,
      payment_method_types: ['card'],
      payment_method_options: {
        card: {
          request_three_d_secure: 'automatic',
        },
      },
      usage: 'off_session',
      metadata: {
        userId: user._id.toString(),
        passengerId: passenger._id.toString(),
        userType: 'passenger',
        addedAt: new Date().toISOString(),
        isWallet: true,
        walletType: normalizedWalletType,
      },
    });

    // // Store temporary setup intent data
    // await PassengerModel.findByIdAndUpdate(passenger._id, {
    //   [`${normalizedWalletType === 'GOOGLE_PAY' ? 'isGooglePay' : 'isApplePay'}`]:
    //     {
    //       enabled: false,
    //       setupIntentId: setupIntent.id,
    //       clientSecret: setupIntent.client_secret,
    //       paymentMethodCreatedAt: null,
    //     },
    // });

    return {
      success: true,
      data: {
        clientSecret: setupIntent.client_secret,
        setupIntentId: setupIntent.id,
      },
    };
  } catch (error) {
    console.error(`STRIPE ERROR: ${error}`);
    return {
      success: false,
      error: error.message || 'Failed to create setup intent',
    };
  }
};

export const deletePassengerWallet = async (passenger, walletType) => {
  try {
    const normalizedWalletType = walletType.trim().toUpperCase();

    if (!['APPLE_PAY', 'GOOGLE_PAY'].includes(normalizedWalletType)) {
      return {
        success: false,
        error: 'Invalid wallet type. Must be APPLE_PAY or GOOGLE_PAY',
      };
    }

    if (!passenger.stripeCustomerId) {
      return {
        success: false,
        error: 'No Stripe customer found for this passenger',
      };
    }

    // Check if wallet is enabled
    const walletField =
      normalizedWalletType === 'GOOGLE_PAY' ? 'isGooglePay' : 'isApplePay';
    const walletData = passenger[walletField];

    if (!walletData?.enabled) {
      return {
        success: false,
        error: `No ${normalizedWalletType === 'GOOGLE_PAY' ? 'Google Pay' : 'Apple Pay'} wallet found or wallet is not enabled`,
      };
    }

    // Get all payment methods for this customer
    const existingPaymentMethods = await stripe.paymentMethods.list({
      customer: passenger.stripeCustomerId,
      type: 'card',
    });

    // Find the payment method associated with this wallet type
    const walletTypeToCheck =
      normalizedWalletType === 'GOOGLE_PAY' ? 'google_pay' : 'apple_pay';
    const walletPaymentMethod = existingPaymentMethods.data.find(
      (pm) => pm.card?.wallet?.type === walletTypeToCheck,
    );

    if (walletPaymentMethod) {
      // Detach the payment method from Stripe
      try {
        await stripe.paymentMethods.detach(walletPaymentMethod.id);
      } catch (detachError) {
        // If payment method is already detached, that's okay
        if (
          detachError.code !== 'resource_missing' &&
          !detachError.message.includes('already been detached')
        ) {
          throw detachError;
        }
      }

      // Remove payment method ID from passenger's paymentMethodIds array
      await updatePassengerPaymentMethod(passenger._id, walletPaymentMethod.id);

      // Check if this was the default payment method
      const defaultCard = await getDefaultCard(passenger.stripeCustomerId);
      if (defaultCard?.defaultCardId === walletPaymentMethod.id) {
        await setDefaultCard(passenger.stripeCustomerId, null);
      }
    }

    // Update passenger model to disable the wallet and clear fields
    await PassengerModel.findByIdAndUpdate(
      passenger._id,
      {
        [walletField]: {
          enabled: false,
          setupIntentId: null,
          clientSecret: null,
          paymentMethodCreatedAt: null,
        },
      },
      { new: true },
    );

    return {
      success: true,
      message: `${normalizedWalletType === 'GOOGLE_PAY' ? 'Google Pay' : 'Apple Pay'} wallet removed successfully`,
    };
  } catch (error) {
    console.error(`STRIPE ERROR: ${error}`);
    return {
      success: false,
      error: error.message || 'Failed to delete wallet',
    };
  }
};

export const holdRidePayment = async (
  passenger,
  amount,
  paymentMethodId,
  paymentMethodType = null,
  cardType = null,
) => {
  try {
    if (!passenger.stripeCustomerId) {
      throw new Error('Passenger does not have a Stripe customer ID');
    }

    if (!paymentMethodId) {
      throw new Error('Payment method ID is required');
    }

    if (!amount || amount <= 0) {
      throw new Error('Invalid amount');
    }

    // Validate payment method type
    if (!PAYMENT_METHODS.includes(paymentMethodType)) {
      throw new Error(`Invalid payment method type: ${paymentMethodType}`);
    }

    if (cardType && !CARD_TYPES.includes(cardType)) {
      throw new Error(`Invalid card type: ${cardType}`);
    }

    // Determine payment method description
    const paymentMethodDescriptions = {
      CARD: 'Card',
      GOOGLE_PAY: 'Google Pay',
      APPLE_PAY: 'Apple Pay',
    };
    const paymentDescription =
      paymentMethodDescriptions[paymentMethodType] || 'Card';

    // Safely extract userId - handle both populated and non-populated cases
    const userId = passenger.userId?._id
      ? passenger.userId._id.toString()
      : sanitizeMetadataValue(passenger.userId);

    // Safely extract passengerId
    const passengerId = sanitizeMetadataValue(passenger._id);

    // Ensure payment method is attached to customer before creating PaymentIntent
    const attachmentResult = await ensurePaymentMethodAttached(
      passenger.stripeCustomerId,
      paymentMethodId,
    );

    if (!attachmentResult.success) {
      throw new Error(
        attachmentResult.error ||
          'Payment method validation failed. Please use a different payment method.',
      );
    }

    // Use the validated payment method ID (may be different if fallback was used)
    const validatedPaymentMethodId = attachmentResult.paymentMethodId;

    // Create a Payment Intent with manual capture to hold/authorize funds
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: 'cad',
      customer: passenger.stripeCustomerId,
      payment_method: validatedPaymentMethodId,
      capture_method: 'manual', // Authorize but don't capture yet
      confirm: true, // Confirm immediately to authorize
      off_session: true, // Customer is not present
      description: `Ride booking authorization (${paymentDescription}) - Estimated fare: $${amount.toFixed(2)}`,
      metadata: {
        type: 'ride_authorization',
        paymentMethodType: sanitizeMetadataValue(paymentMethodType),
        passengerId: passengerId,
        userId: userId,
        userType: 'passenger',
        addedAt: new Date().toISOString(),
        originalPaymentMethodId: paymentMethodId, // Track original
        usedPaymentMethodId: validatedPaymentMethodId, // Track what was actually used
        ...(attachmentResult.usedFallback ? { usedFallback: 'true' } : {}),
        ...(paymentMethodType === 'CARD'
          ? {
              isWallet: 'false',
              cardType: sanitizeMetadataValue(cardType),
            }
          : {
              isWallet: 'true',
              walletType: sanitizeMetadataValue(paymentMethodType),
            }),
      },
    });

    // Check if authorization was successful
    if (
      paymentIntent.status !== 'requires_capture' &&
      paymentIntent.status !== 'succeeded'
    ) {
      throw new Error(
        `Payment authorization failed. Status: ${paymentIntent.status}`,
      );
    }

    return {
      success: true,
      paymentIntentId: paymentIntent.id,
      status: paymentIntent.status,
      amount: amount,
      paymentMethodType: paymentMethodType,
    };
  } catch (error) {
    console.error('STRIPE ERROR: ', error);
    return {
      success: false,
      error: error.message || 'Failed to authorize payment',
    };
  }
};

export const cancelPaymentHold = async (paymentIntentId) => {
  try {
    if (!paymentIntentId) {
      throw new Error('Payment intent ID is required');
    }

    // Cancel the payment intent to release the hold
    const cancelledIntent = await stripe.paymentIntents.cancel(paymentIntentId);

    return {
      success: true,
      paymentIntentId: cancelledIntent.id,
      status: cancelledIntent.status,
    };
  } catch (error) {
    console.error('STRIPE ERROR: ', error);
    return {
      success: false,
      error: error.message || 'Failed to cancel payment hold',
    };
  }
};

/**
 * Capture 20% commission at booking time
 * This function captures 20% of the estimated fare immediately when a ride is booked
 */
export const captureCommissionAtBooking = async (
  paymentIntentId,
  estimatedFare,
  rideId,
  carType,
  discount = 0,
) => {
  try {
    if (!paymentIntentId) {
      throw new Error('Payment intent ID is required');
    }

    if (!estimatedFare || estimatedFare <= 0) {
      throw new Error('Invalid estimated fare amount');
    }

    if (!rideId) {
      throw new Error('Ride ID is required');
    }

    // Calculate 20% commission
    const commissionPercentage = 20;
    const commissionAmount = Math.round((estimatedFare * commissionPercentage) / 100 * 100) / 100; // Round to 2 decimal places
    const commissionAmountInCents = Math.round(commissionAmount * 100);

    // Retrieve payment intent to check status
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status !== 'requires_capture') {
      throw new Error(
        `Payment intent is not in requires_capture state. Current status: ${paymentIntent.status}`,
      );
    }

    // Capture only the commission amount (20%)
    const capturedPayment = await stripe.paymentIntents.capture(
      paymentIntentId,
      {
        amount_to_capture: commissionAmountInCents,
      },
    );

    if (capturedPayment.status !== 'succeeded') {
      throw new Error(
        `Commission capture failed. Status: ${capturedPayment.status}`,
      );
    }

    // Store commission record
    await AdminCommission.create({
      date: new Date(),
      rideId,
      carType,
      totalAmount: estimatedFare,
      discount,
      commission: commissionPercentage,
      commissionAmount,
      driverDistanceCommission: 0,
      isRefunded: false,
    });

    return {
      success: true,
      paymentIntentId: capturedPayment.id,
      status: capturedPayment.status,
      commissionAmount,
      estimatedFare,
      remainingAmount: estimatedFare - commissionAmount,
    };
  } catch (error) {
    console.error('STRIPE ERROR: ', error);
    return {
      success: false,
      error: error.message || 'Failed to capture commission at booking',
    };
  }
};

/**
 * Capture full payment on cancellation
 * This function captures the full estimated fare when user cancels the ride
 */
export const captureFullPaymentOnCancellation = async (
  paymentIntentId,
  estimatedFare,
  rideId,
) => {
  try {
    if (!paymentIntentId) {
      throw new Error('Payment intent ID is required');
    }

    if (!estimatedFare || estimatedFare <= 0) {
      throw new Error('Invalid estimated fare amount');
    }

    if (!rideId) {
      throw new Error('Ride ID is required');
    }

    // Retrieve payment intent to check status
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status !== 'requires_capture') {
      // If already captured, check if we need to capture remaining amount
      if (paymentIntent.status === 'succeeded') {
        const alreadyCaptured = paymentIntent.amount_received
          ? paymentIntent.amount_received / 100
          : paymentIntent.amount / 100;
        const remainingAmount = estimatedFare - alreadyCaptured;

        if (remainingAmount > 0.01) {
          // Create a new payment intent for the remaining amount
          const ride = await RideModel.findById(rideId).populate('passengerId');
          if (!ride) {
            throw new Error('Ride not found');
          }

          const passenger = await PassengerModel.findById(ride.passengerId).populate('userId');
          if (!passenger || !passenger.stripeCustomerId) {
            throw new Error('Passenger not found or missing Stripe customer ID');
          }

          if (!ride.paymentMethodId) {
            throw new Error('Payment method not found in ride');
          }

          const remainingPaymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(remainingAmount * 100),
            currency: 'cad',
            customer: passenger.stripeCustomerId,
            payment_method: ride.paymentMethodId,
            confirm: true,
            off_session: true,
            description: `Cancellation fee for ride ${rideId} - Remaining amount: $${remainingAmount.toFixed(2)}`,
            metadata: {
              type: 'cancellation_fee',
              rideId: rideId.toString(),
              passengerId: passenger._id.toString(),
            },
          });

          return {
            success: true,
            paymentIntentId: remainingPaymentIntent.id,
            status: remainingPaymentIntent.status,
            amount: estimatedFare,
            alreadyCaptured,
            newlyCaptured: remainingAmount,
          };
        }

        return {
          success: true,
          paymentIntentId: paymentIntent.id,
          status: paymentIntent.status,
          amount: estimatedFare,
          message: 'Full amount already captured',
        };
      }

      throw new Error(
        `Payment intent is not in requires_capture state. Current status: ${paymentIntent.status}`,
      );
    }

    // Calculate remaining amount to capture (full fare - already captured commission)
    // amount_capturable is the amount that can still be captured
    // amount is the total authorized amount
    // amount_received is the amount already captured
    const totalAuthorized = paymentIntent.amount / 100; // Convert from cents
    const alreadyCaptured = paymentIntent.amount_received
      ? paymentIntent.amount_received / 100
      : totalAuthorized - (paymentIntent.amount_capturable / 100);
    const remainingAmount = estimatedFare - alreadyCaptured;
    const remainingAmountInCents = Math.round(remainingAmount * 100);

    if (remainingAmountInCents > 0) {
      // Capture the remaining amount
      const capturedPayment = await stripe.paymentIntents.capture(
        paymentIntentId,
        {
          amount_to_capture: remainingAmountInCents,
        },
      );

      if (capturedPayment.status !== 'succeeded') {
        throw new Error(
          `Full payment capture failed. Status: ${capturedPayment.status}`,
        );
      }

      return {
        success: true,
        paymentIntentId: capturedPayment.id,
        status: capturedPayment.status,
        amount: estimatedFare,
        alreadyCaptured,
        newlyCaptured: remainingAmount,
      };
    }

    return {
      success: true,
      paymentIntentId: paymentIntent.id,
      status: paymentIntent.status,
      amount: estimatedFare,
      message: 'Full amount already captured',
    };
  } catch (error) {
    console.error('STRIPE ERROR: ', error);
    return {
      success: false,
      error: error.message || 'Failed to capture full payment on cancellation',
    };
  }
};

export const partialRefundPaymentHold = async (
  paymentIntentId,
  estimatedFare,
  rideId,
) => {
  try {
    if (!paymentIntentId) {
      throw new Error('Payment intent ID is required');
    }

    if (!estimatedFare || estimatedFare <= 0) {
      throw new Error('Invalid estimated fare amount');
    }

    // Retrieve payment intent to check status
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status !== 'requires_capture') {
      throw new Error(
        `Payment intent is not in requires_capture state. Current status: ${paymentIntent.status}`,
      );
    }

    // Calculate amounts
    const fullAmount = Math.round(estimatedFare * 100); // Convert to cents
    const refundAmount = Math.round(estimatedFare * 0.9 * 100); // 90% refund
    const cancellationFee = Math.round(estimatedFare * 0.1 * 100); // 10% cancellation fee

    // Capture the full payment
    const capturedPayment = await stripe.paymentIntents.capture(
      paymentIntentId,
      {
        amount_to_capture: fullAmount,
      },
    );

    if (capturedPayment.status !== 'succeeded') {
      throw new Error(
        `Payment capture failed. Status: ${capturedPayment.status}`,
      );
    }

    // Refund 90% back to passenger
    const refund = await stripe.refunds.create({
      payment_intent: paymentIntentId,
      amount: refundAmount,
      reason: 'requested_by_customer',
      metadata: {
        rideId: rideId?.toString() || '',
        cancellationFee: (cancellationFee / 100).toString(),
        refundType: 'PARTIAL_CANCELLATION_FEE',
      },
    });

    return {
      success: true,
      paymentIntentId: capturedPayment.id,
      refundId: refund.id,
      refundAmount: refundAmount / 100,
      cancellationFee: cancellationFee / 100,
      totalAmount: estimatedFare,
      status: refund.status,
    };
  } catch (error) {
    console.error('STRIPE ERROR: ', error);
    return {
      success: false,
      error: error.message || 'Failed to process partial refund',
    };
  }
};

export const captureHeldPayment = async (
  paymentIntentId,
  amount, // Actual fare (might differ from estimated)
  rideId,
) => {
  try {
    if (!paymentIntentId) {
      throw new Error('Payment intent ID is required');
    }

    if (!amount || amount <= 0) {
      throw new Error('Invalid amount');
    }

    if (!rideId) {
      throw new Error('Ride ID is required');
    }

    // Fetch ride to get driver information
    const ride = await RideModel.findById(rideId).populate('driverId');
    if (!ride) {
      throw new Error('Ride not found');
    }

    if (!ride.driverId) {
      throw new Error('Ride does not have a driver assigned');
    }

    const driver = await DriverModel.findById(
      ride.driverId._id || ride.driverId,
    );
    if (!driver) {
      throw new Error('Driver not found');
    }

    if (!driver.stripeAccountId) {
      throw new Error('Driver does not have a Stripe connected account');
    }

    // Retrieve payment intent to check status
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status !== 'requires_capture') {
      throw new Error(
        `Payment intent is not in requires_capture state. Current status: ${paymentIntent.status}`,
      );
    }

    // Note: Cannot update amount when status is 'requires_capture'
    // If amount differs, we'll capture the different amount using amount_to_capture
    const authorizedAmount = paymentIntent.amount / 100; // Convert from cents
    const amountToCapture = Math.round(amount * 100); // Amount to capture in cents
    const shouldCaptureDifferentAmount = Math.abs(authorizedAmount - amount) > 0.01;

    // Calculate admin commission
    // Check if commission was already calculated
    let adminCommission = 0;
    const existingCommission = await AdminCommission.findOne({ rideId });
    if (existingCommission) {
      adminCommission = existingCommission.commissionAmount;
    } else {
      // Calculate commission if not already done
      // Import Commission model dynamically
      const Commission = (await import('../models/Commission.js')).default;
      const commission = await Commission.findOne({
        carType: ride.carType,
      }).lean();
      if (commission) {
        let driverDistanceCommission = 0;
        if (ride.driverDistance && ride.driverDistance > 5) {
          driverDistanceCommission = 5 - Math.ceil(ride.driverDistance);
        }
        // Commission calculation matches deductRidenCommission logic
        adminCommission =
          Math.floor((amount / 100) * commission.percentage) -
          driverDistanceCommission;
      }
    }

    const driverAmount = amount - adminCommission;

    // Capture the payment to platform account
    // If amount differs from authorized amount, capture the different amount
    const capturedPayment = await stripe.paymentIntents.capture(
      paymentIntentId,
      shouldCaptureDifferentAmount
        ? {
            amount_to_capture: amountToCapture,
          }
        : undefined, // Capture full authorized amount if same
    );

    if (capturedPayment.status !== 'succeeded') {
      throw new Error(
        `Payment capture failed. Status: ${capturedPayment.status}`,
      );
    }

    // Transfer driver's share to driver's connected account
    const transfer = await stripe.transfers.create({
      amount: Math.round(driverAmount * 100), // Driver's share after commission
      currency: 'cad',
      destination: driver.stripeAccountId,
      source_transaction: capturedPayment.latest_charge, // Link to the captured payment
      description: `Ride payment transfer for ride ${rideId}`,
      metadata: {
        rideId: rideId.toString(),
        paymentIntentId: paymentIntentId,
        driverId: driver._id.toString(),
        amount: driverAmount.toString(),
        commission: adminCommission.toString(),
      },
    });

    return {
      success: true,
      paymentIntentId: capturedPayment.id,
      status: capturedPayment.status,
      amount: amount,
      driverAmount: driverAmount,
      commission: adminCommission,
      transferId: transfer.id,
      driverStripeAccountId: driver.stripeAccountId,
      capturedAt: new Date(),
    };
  } catch (error) {
    console.error('STRIPE ERROR: ', error);
    return {
      success: false,
      error: error.message || 'Failed to capture payment',
    };
  }
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

    // const [notify, notifyDriver] = await Promise.allSettled([
    //   notifyUser({
    //     userId: passenger.userId,
    //     title: negativeBalanceUsed
    //       ? '⚠️ Payment Processed with Negative Balance'
    //       : '✅ Payment Successful!',
    //     message: negativeBalanceUsed
    //       ? `Your ride payment of $${amount} was processed. Insufficient wallet balance - $${updatedWallet.negativeBalance} added to negative balance. Please settle this before your next ride.`
    //       : `Thanks for riding with RIDEN. Your payment of $${amount} was completed successfully. Receipt is available in your ride history.`,
    //     module: 'payment',
    //     metadata: ride,
    //     type: 'ALERT',
    //     actionLink: `${env.FRONTEND_URL}/ride?rideId=${ride._id}`,
    //   }),
    //   notifyUser({
    //     userId: driver.userId,
    //     title: '💰 Payment Received',
    //     message: `You've received $${amount} for your recent ride.`,
    //     module: 'payment',
    //     metadata: ride,
    //     type: 'ALERT',
    //     actionLink: `${env.FRONTEND_URL}/ride?rideId=${ride._id}`,
    //   }),
    // ]);

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

    // const [notify, notifyDriver] = await Promise.allSettled([
    //   notifyUser({
    //     userId: passenger.userId,
    //     title: hadNegativeBalance
    //       ? '✅ Payment Successful + Negative Balance Cleared!'
    //       : '✅ Payment Successful!',
    //     message: hadNegativeBalance
    //       ? `Thanks for riding with RIDEN. Your payment of $${actualAmount} was completed successfully and your negative balance has been cleared. Receipt is available in your ride history.`
    //       : `Thanks for riding with RIDEN. Your payment of $${actualAmount} was completed successfully. Receipt is available in your ride history.`,
    //     module: 'payment',
    //     metadata: ride,
    //     type: 'ALERT',
    //     actionLink: `${env.FRONTEND_URL}/ride?rideId=${ride._id}`,
    //   }),
    //   notifyUser({
    //     userId: driver.userId,
    //     title: '💰 Payment Received',
    //     message: `You've received $${amount} for your recent ride.`,
    //     module: 'payment',
    //     metadata: ride,
    //     type: 'ALERT',
    //     actionLink: `${env.FRONTEND_URL}/ride?rideId=${ride._id}`,
    //   }),
    // ]);

    // if (notify.status === 'rejected' || notifyDriver.status === 'rejected') {
    //   console.log('Failed to send notification');
    // }

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

export const processDriverPayoutAfterCapture = async (
  passenger,
  driver,
  ride,
  amount, // Driver's share (after commission)
  actualAmount, // Total passenger paid (including commission)
  paymentIntentId, // Already captured payment intent ID
  category,
) => {
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      // Validate amounts
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

      // Commission calculation
      const commissionAmount = parsedActualAmount - parsedAmount;
      if (commissionAmount <= 0) {
        throw new Error(
          'Commission calculation error: actual amount cannot be less than driver amount',
        );
      }

      // Retrieve the captured payment intent
      const paymentIntent =
        await stripe.paymentIntents.retrieve(paymentIntentId);
      if (paymentIntent.status !== 'succeeded') {
        throw new Error(
          `Payment intent not succeeded. Status: ${paymentIntent.status}`,
        );
      }

      // Get driver and passenger wallets
      const [driverWallet, passengerWallet] = await Promise.all([
        DriverWallet.findOne({ driverId: driver._id }).session(session),
        PassengerWallet.findOne({ passengerId: passenger._id }).session(
          session,
        ),
      ]);

      if (!driverWallet) throw new Error('Driver wallet not found');
      if (!passengerWallet) throw new Error('Passenger wallet not found');

      // Clear negative balance if exists (from the captured payment)
      const passengerNegativeBalance = passengerWallet.negativeBalance || 0;
      if (passengerNegativeBalance > 0) {
        await PassengerWallet.findOneAndUpdate(
          { passengerId: passenger._id },
          { $inc: { negativeBalance: -passengerNegativeBalance } },
          { session },
        );
      }

      // Handle driver balance updates
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

      // Create transactions
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
                ...paymentIntent,
                negativeBalanceCleared: passengerNegativeBalance,
                paymentIntentId: paymentIntentId,
                fromHeldPayment: true,
              },
              status: 'succeeded',
              referenceId: paymentIntentId,
              receiptUrl: paymentIntentId,
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
                paymentIntentId: paymentIntentId,
                fromHeldPayment: true,
              },
              status: 'succeeded',
              referenceId: paymentIntentId,
              receiptUrl: paymentIntentId,
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
                      paymentIntent: paymentIntentId,
                      rideId: ride._id,
                      previousNegativeBalance: passengerNegativeBalance,
                      fromHeldPayment: true,
                    },
                    status: 'succeeded',
                    referenceId: `nb_clear_${paymentIntentId}`,
                    receiptUrl: paymentIntentId,
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
              metadata: {
                paymentIntentId: paymentIntentId,
                fromHeldPayment: true,
              },
            },
          ],
          { session },
        ).then((res) => res[0]),
      ]);
    });

    // Get the transaction for return value
    const transaction = await TransactionModel.findOne({
      rideId: ride._id,
      type: 'DEBIT',
      for: 'passenger',
    });

    return {
      success: true,
      transaction,
      paymentIntentId: paymentIntentId,
    };
  } catch (error) {
    console.error(`PAYOUT AFTER CAPTURE FAILED: ${error.message}`);
    return { success: false, error: error.message };
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
  try {
    // Validate driver has Stripe account
    if (!driver.stripeAccountId) {
      throw new Error('Driver has no Stripe account linked');
    }

    // Validate bank account data
    if (!bankAccountData) {
      throw new Error('Bank account data is required');
    }

    // Create external account in Stripe
    const bankAccount = await stripe.accounts.createExternalAccount(
      driver.stripeAccountId,
      {
        external_account: bankAccountData,
      },
    );

    if (!bankAccount || !bankAccount.id) {
      throw new Error('Failed to create external account in Stripe');
    }

    // Check Stripe for existing external accounts to see if there's a default
    const existingAccounts = await stripe.accounts.listExternalAccounts(
      driver.stripeAccountId,
      {
        limit: 100, // Get all accounts
      },
    );

    // Check if any account is set as default for the currency (CAD)
    const hasDefaultAccount = existingAccounts.data.some(
      (account) => account.default_for_currency === true,
    );

    // If no default account exists in Stripe, set the newly created one as default
    if (!hasDefaultAccount) {
      // Set as default in Stripe (for the currency)
      await stripe.accounts.updateExternalAccount(
        driver.stripeAccountId,
        bankAccount.id,
        { default_for_currency: true },
      );
    }

    return {
      success: true,
      bankAccount,
    };
  } catch (error) {
    console.error('STRIPE ERROR:', error);
    return {
      success: false,
      error: error.message || 'Failed to add driver external account',
    };
  }
};

export const getAllExternalAccounts = async (stripeAccountId) => {
  try {
    if (!stripeAccountId) {
      throw new Error('Stripe account ID is required');
    }

    // Get all external accounts from Stripe
    const externalAccounts =
      await stripe.accounts.listExternalAccounts(stripeAccountId);

    // Find the default account ID (account with default_for_currency: true)
    const defaultAccount = externalAccounts.data.find(
      (account) => account.default_for_currency === true,
    );
    const defaultAccountId = defaultAccount?.id;

    // Map accounts and add isDefault flag
    const accountsWithDefaultFlag = externalAccounts.data.map((account) => ({
      ...account,
      isDefault: account.id === defaultAccountId,
    }));

    return {
      success: true,
      accounts: accountsWithDefaultFlag,
    };
  } catch (error) {
    console.error('STRIPE ERROR:', error);
    return {
      success: false,
      error: error.message || 'Failed to get all external accounts',
    };
  }
};

export const getExternalAccountById = async (
  stripeAccountId,
  externalAccountId,
) => {
  try {
    if (!stripeAccountId) {
      throw new Error('Stripe account ID is required');
    }

    if (!externalAccountId) {
      throw new Error('External account ID is required');
    }

    // Retrieve the external account from Stripe
    const externalAccount = await stripe.accounts.retrieveExternalAccount(
      stripeAccountId,
      externalAccountId,
    );

    // Get all external accounts to find the default one
    const allAccounts =
      await stripe.accounts.listExternalAccounts(stripeAccountId);
    const defaultAccount = allAccounts.data.find(
      (account) => account.default_for_currency === true,
    );
    const defaultAccountId = defaultAccount?.id;

    // Add isDefault flag
    const account = {
      ...externalAccount,
      isDefault: externalAccount.id === defaultAccountId,
    };
    return {
      success: true,
      account,
    };
  } catch (error) {
    console.error('STRIPE ERROR:', error);
    return {
      success: false,
      error: error.message || 'Failed to get external account',
    };
  }
};

export const deleteExternalAccount = async (
  stripeAccountId,
  externalAccountId,
) => {
  try {
    if (!stripeAccountId) {
      throw new Error('Stripe account ID is required');
    }

    if (!externalAccountId) {
      throw new Error('External account ID is required');
    }

    // Check if this is the default account before deletion
    const allAccounts =
      await stripe.accounts.listExternalAccounts(stripeAccountId);
    const defaultAccount = allAccounts.data.find(
      (account) => account.default_for_currency === true,
    );
    const isDeletingDefault = defaultAccount?.id === externalAccountId;

    // Delete the external account from Stripe
    const deletedAccount = await stripe.accounts.deleteExternalAccount(
      stripeAccountId,
      externalAccountId,
    );

    // If we deleted the default account, set a new default if available
    if (isDeletingDefault) {
      // Get remaining accounts after deletion
      const remainingAccounts =
        await stripe.accounts.listExternalAccounts(stripeAccountId);

      if (remainingAccounts.data.length > 0) {
        // Set the first remaining account as default
        const newDefaultAccountId = remainingAccounts.data[0].id;
        await stripe.accounts.updateExternalAccount(
          stripeAccountId,
          newDefaultAccountId,
          { default_for_currency: true },
        );
      }
    }

    return {
      success: true,
      deletedAccount,
    };
  } catch (error) {
    console.error('STRIPE ERROR:', error);
    return {
      success: false,
      error: error.message || 'Failed to delete external account',
    };
  }
};

export const setDefaultExternalAccount = async (
  stripeAccountId,
  externalAccountId,
) => {
  try {
    if (!stripeAccountId) {
      throw new Error('Stripe account ID is required');
    }

    if (!externalAccountId) {
      throw new Error('External account ID is required');
    }

    // Get all external accounts to find current default
    const allAccounts =
      await stripe.accounts.listExternalAccounts(stripeAccountId);

    // Verify the account exists
    const accountExists = allAccounts.data.some(
      (account) => account.id === externalAccountId,
    );
    if (!accountExists) {
      throw new Error('External account not found');
    }

    // Find current default account
    const currentDefault = allAccounts.data.find(
      (account) => account.default_for_currency === true,
    );

    // If there's a different default account, unset it first
    if (currentDefault && currentDefault.id !== externalAccountId) {
      await stripe.accounts.updateExternalAccount(
        stripeAccountId,
        currentDefault.id,
        { default_for_currency: false },
      );
    }

    // Set the new account as default
    const updatedAccount = await stripe.accounts.updateExternalAccount(
      stripeAccountId,
      externalAccountId,
      { default_for_currency: true },
    );

    return {
      success: true,
      updatedAccount,
    };
  } catch (error) {
    console.error('STRIPE ERROR:', error);
    return {
      success: false,
      error: error.message || 'Failed to set default external account',
    };
  }
};

export const getDriverBalanceFromStripe = async (stripeAccountId) => {
  try {
    if (!stripeAccountId) {
      throw new Error('Stripe account ID is required');
    }

    // Retrieve balance from Stripe connected account
    const balance = await stripe.balance.retrieve({
      stripeAccount: stripeAccountId,
    });

    // Format balance data - convert amounts from cents to dollars
    const formattedBalance = {
      available: balance.available.map((item) => ({
        amount: item.amount / 100, // Convert from cents to dollars
        currency: item.currency,
        source_types: item.source_types,
      })),
      pending: balance.pending.map((item) => ({
        amount: item.amount / 100, // Convert from cents to dollars
        currency: item.currency,
        source_types: item.source_types,
      })),
      connect_reserved:
        balance.connect_reserved?.map((item) => ({
          amount: item.amount / 100, // Convert from cents to dollars
          currency: item.currency,
        })) || [],
      issuing: balance.issuing || {},
      livemode: balance.livemode,
    };

    // Calculate total available balance (sum of all available amounts)
    const totalAvailable = formattedBalance.available.reduce(
      (sum, item) => sum + item.amount,
      0,
    );

    // Calculate total pending balance (sum of all pending amounts)
    const totalPending = formattedBalance.pending.reduce(
      (sum, item) => sum + item.amount,
      0,
    );

    return {
      ...formattedBalance,
      totalAvailable,
      totalPending,
      totalBalance: totalAvailable + totalPending,
    };
  } catch (error) {
    console.error('STRIPE ERROR:', error);
    throw error;
  }
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

      const user = await User.findById(driver._id).session(session);
      if (!user) {
        throw new Error(
          `Stripe payout failed: ${payout?.failure_message || 'Unknown error'}`,
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
      const transaction = await TransactionModel.create(
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
            referenceId:
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
              payout.id,
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

      const formattedDate = new Date()
        .toLocaleDateString('en-GB')
        .replace(/\//g, '-');
      await sendDriverPaymentProcessedEmail(
        user.email,
        user.name,
        parsedAmount,
        formattedDate,
        transaction._id,
      );
    });

    // // Transaction committed successfully, send notification
    // const notify = await notifyUser({
    //   userId: driver.userId,
    //   title: '💰 Payout Initiated',
    //   message: `Your payout of $${amount} has been successfully initiated and should arrive in your bank account within 1-2 business days.`,
    //   module: 'payout',
    //   metadata: { amount, payoutMethod: 'bank_transfer' },
    //   type: 'ALERT',
    //   actionLink: `${env.FRONTEND_URL}/driver/payouts`,
    // });

    // if (!notify) {
    //   console.log(
    //     'Failed to send payout notification, but payout was processed',
    //   );
    // }

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
export const transferToDriverAccount = async (driver, requestId) => {
  if (!driver.stripeAccountId)
    throw new Error('Driver has no Stripe account linked');

  // Check Stripe directly for default external account
  const externalAccounts = await stripe.accounts.listExternalAccounts(
    driver.stripeAccountId,
  );

  const defaultAccount = externalAccounts.data.find(
    (account) => account.default_for_currency === true,
  );

  if (!defaultAccount) {
    throw new Error(
      'Driver has no default external account (bank account) set up',
    );
  }

  // Verify the default external account exists and is valid
  if (defaultAccount.deleted) {
    throw new Error('Default external account has been deleted');
  }

  const wallet = await getDriverBalance(driver._id);
  if (wallet.pendingBalance <= 10)
    throw new Error('Transfer amount must be greater than $10');

  // Decide payout method based on external account type and Stripe/region rules
  // In Canada, instant payouts are only supported for debit cards, not bank accounts.
  let payoutMethod = 'instant';
  if (defaultAccount.object === 'bank_account') {
    // Fall back to standard payout for bank accounts to avoid Stripe error
    payoutMethod = 'standard';
  }

  // Create payout from driver's connected account to their default external account
  // Stripe automatically uses the default external account if destination is not specified
  const payout = await stripe.payouts.create(
    {
      amount: Math.round(wallet.pendingBalance * 100),
      currency: 'cad',
      method: payoutMethod,
      description: `Driver payout transfer for request ${requestId}`,
      // destination is not specified, so Stripe will use the default external account
    },
    {
      stripeAccount: driver.stripeAccountId, // Payout from connected account
    },
  );

  if (!payout || !payout.id || payout.status === 'failed') {
    const notify = await createAdminNotification({
      title: 'Payment Failure',
      message: `A payout for driver has failed. Action required.`,
      metadata: { requestId, payout },
      module: 'payment_management',
      type: 'ALERT',
      actionLink: `${env.FRONTEND_URL}/api/admin/payout/previous?page=1&limit=10`,
    });
    if (!notify) {
      console.error('Failed to send notification');
    }
    throw new Error(
      `Payout failed: ${payout?.failure_message || 'Unknown error'}`,
    );
  }

  // Move funds from pending to available balance (they're now in connected account)
  // Then decrease available balance since payout was made
  if (payout.id) {
    // First move pending to available
    await increaseDriverAvailableBalance(driver._id, wallet.pendingBalance);
    await decreaseDriverPendingBalance(driver._id, wallet.pendingBalance);
    // Then decrease available since payout was made
    await DriverWallet.findOneAndUpdate(
      { driverId: driver._id },
      { $inc: { availableBalance: -wallet.pendingBalance } },
    );
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
    stripeTransferId: payout.id, // Keep same field name for backward compatibility
  });

  await Promise.all([
    createTransaction({
      driverId: driver._id,
      type: 'DEBIT',
      category: 'INSTANT-PAYOUT',
      amount: wallet.pendingBalance,
      for: 'admin',
      metadata: { payout, requestId },
      status: 'succeeded',
      referenceId: payout.id,
      receiptUrl: payout.id,
    }),
    createTransaction({
      driverId: driver._id,
      type: 'CREDIT',
      category: 'INSTANT-PAYOUT',
      amount: wallet.pendingBalance,
      for: 'driver',
      metadata: { payout, requestId },
      status: 'succeeded',
      referenceId: payout.id,
      receiptUrl: payout.id,
    }),
  ]);

  return payout;
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

        if (
          existingRefunds.data.length > 0 &&
          existingRefunds.data[0].status === 'succeeded'
        ) {
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
          console.log(
            'Charge already refunded in Stripe, processing internal refund only',
          );
          stripeErrorOccurred = true;
          refund = {
            id: `already_refunded_${Date.now()}`,
            status: 'succeeded',
            receipt_url: null,
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
          { session },
        );
        refundRemaining -= pendingUsed;
      }

      if (refundRemaining > 0) {
        await DriverWallet.findOneAndUpdate(
          { driverId: driver._id },
          { $inc: { negativeBalance: refundRemaining } },
          { session },
        );
      }

      // 5. Log refund transactions atomically using direct model creation
      await Promise.all([
        TransactionModel.create(
          [
            {
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
                originalReferenceId: referenceId,
              },
              status: 'succeeded',
              referenceId: refund.id,
              receiptUrl: refund.receipt_url || refund.id,
            },
          ],
          { session },
        ).then((res) => res[0]),

        TransactionModel.create(
          [
            {
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
                originalReferenceId: referenceId,
              },
              status: 'succeeded',
              referenceId: refund.id,
              receiptUrl: refund.receipt_url || refund.id,
            },
          ],
          { session },
        ).then((res) => res[0]),

        RefundTransaction.create(
          [
            {
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
                alreadyRefunded: stripeErrorOccurred,
              },
            },
          ],
          { session },
        ).then((res) => res[0]),
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
      alreadyRefunded: stripeErrorOccurred,
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
        const passenger = await PassengerModel.findById(
          passengerDebitTx.passengerId,
        );
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

/**
 * Transfer tip directly to driver's external account
 * Handles both wallet and card payments, transfers tip to driver's connected account,
 * then creates instant payout to driver's external bank account
 */
export const transferTipToDriverExternalAccount = async (
  passenger,
  driver,
  ride,
  tipAmount,
  paymentMethod, // 'WALLET' or 'CARD'/'GOOGLE_PAY'/'APPLE_PAY'
  paymentMethodId, // Required for card payments
) => {
  const session = await mongoose.startSession();

  try {
    let paymentIntentId = null;
    let chargeId = null;

    // Validate tip amount
    const parsedAmount = Number(tipAmount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      throw new Error('Invalid tip amount');
    }

    // Minimum tip amount for payout
    const MIN_TIP_AMOUNT = 1; // Minimum $1 tip
    if (parsedAmount < MIN_TIP_AMOUNT) {
      throw new Error(`Tip amount must be at least $${MIN_TIP_AMOUNT}`);
    }

    await session.withTransaction(async () => {
      // Get wallets
      const [passengerWallet, driverWallet] = await Promise.all([
        PassengerWallet.findOne({ passengerId: passenger._id }).session(
          session,
        ),
        DriverWallet.findOne({ driverId: driver._id }).session(session),
      ]);

      if (!passengerWallet) throw new Error('Passenger wallet not found');
      if (!driverWallet) throw new Error('Driver wallet not found');

      // Handle payment based on payment method
      if (paymentMethod === 'WALLET') {
        // Deduct from passenger wallet
        if (passengerWallet.availableBalance < parsedAmount) {
          const shortfall = parsedAmount - passengerWallet.availableBalance;
          // Use available balance first
          if (passengerWallet.availableBalance > 0) {
            await PassengerWallet.findOneAndUpdate(
              { passengerId: passenger._id },
              { $inc: { availableBalance: -passengerWallet.availableBalance } },
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
          // Sufficient balance
          await PassengerWallet.findOneAndUpdate(
            { passengerId: passenger._id },
            { $inc: { availableBalance: -parsedAmount } },
            { session },
          );
        }

        // Create transaction record for passenger debit
        await TransactionModel.create(
          [
            {
              passengerId: passenger._id,
              driverId: driver._id,
              rideId: ride._id,
              type: 'DEBIT',
              category: 'TIP',
              amount: parsedAmount,
              for: 'passenger',
              metadata: {
                tipAmount: parsedAmount,
                rideId: ride._id.toString(),
                paymentMethod: 'WALLET',
              },
              status: 'succeeded',
              referenceId: `tip_${ride._id}_${Date.now()}`,
            },
          ],
          { session },
        ).then((res) => res[0]);
      } else {
        // Card payment - charge passenger
        if (!paymentMethodId) {
          throw new Error('Payment method ID is required for card payments');
        }

        if (!passenger.stripeCustomerId) {
          throw new Error('Passenger has no Stripe customer ID');
        }

        // Ensure payment method is attached to customer before use
        // Use the helper function for consistent validation
        const attachmentResult = await ensurePaymentMethodAttached(
          passenger.stripeCustomerId,
          paymentMethodId,
        );

        if (!attachmentResult.success) {
          throw new Error(
            attachmentResult.error ||
              'Payment method validation failed. Please use a different payment method.',
          );
        }

        // Use the validated payment method ID (may be different if fallback was used)
        const finalPaymentMethodId = attachmentResult.paymentMethodId;

        // Charge passenger for tip using the validated payment method ID
        const paymentIntent = await stripe.paymentIntents.create({
          amount: Math.round(parsedAmount * 100), // Convert to cents
          currency: 'cad',
          customer: passenger.stripeCustomerId,
          payment_method: finalPaymentMethodId, // Use validated payment method (may be different from original)
          off_session: true,
          confirm: true,
          description: `Tip payment for ride ${ride.rideId || ride._id}`,
          metadata: {
            rideId: ride._id.toString(),
            tipAmount: parsedAmount.toString(),
            driverId: driver._id.toString(),
            originalPaymentMethodId: paymentMethodId, // Track original for reference
            usedPaymentMethodId: finalPaymentMethodId, // Track what was actually used
            ...(attachmentResult.usedFallback ? { usedFallback: 'true' } : {}),
          },
        });

        if (paymentIntent.status !== 'succeeded') {
          throw new Error(`Payment failed: ${paymentIntent.status}`);
        }

        paymentIntentId = paymentIntent.id;
        chargeId = paymentIntent.latest_charge;

        // Create transaction record for passenger debit
        await TransactionModel.create(
          [
            {
              passengerId: passenger._id,
              driverId: driver._id,
              rideId: ride._id,
              type: 'DEBIT',
              category: 'TIP',
              amount: parsedAmount,
              for: 'passenger',
              metadata: {
                tipAmount: parsedAmount,
                rideId: ride._id.toString(),
                paymentIntentId: paymentIntent.id,
                chargeId: chargeId,
                paymentMethod: paymentMethod,
              },
              status: 'succeeded',
              referenceId: paymentIntent.id,
              receiptUrl: paymentIntent.id,
            },
          ],
          { session },
        ).then((res) => res[0]);
      }

      // Add tip to driver's wallet pendingBalance
      // Tip will be paid out via weekly payout worker
      // Handle driver balance updates (similar to ride payment)
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
            // Add remaining to pending balance
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
        // No negative balance - add tip to pending balance
        await DriverWallet.findOneAndUpdate(
          { driverId: driver._id },
          { $inc: { pendingBalance: parsedAmount } },
          { session },
        );
      }

      // Create transaction record for driver credit
      await TransactionModel.create(
        [
          {
            passengerId: passenger._id,
            driverId: driver._id,
            rideId: ride._id,
            type: 'CREDIT',
            category: 'TIP',
            amount: parsedAmount,
            for: 'driver',
            metadata: {
              tipAmount: parsedAmount,
              rideId: ride._id.toString(),
              paymentIntentId: paymentIntentId || null,
              chargeId: chargeId || null,
              paymentMethod: paymentMethod,
              payoutMethod: 'weekly', // Will be paid via weekly payout
            },
            status: 'succeeded',
            referenceId: `tip_${ride._id}_${Date.now()}`,
          },
        ],
        { session },
      ).then((res) => res[0]);
    });

    // Send notifications
    await Promise.all([
      notifyUser({
        userId: passenger.userId?._id,
        title: 'Tip Sent',
        message: `You sent a $${parsedAmount} tip to your driver`,
        module: 'payment',
        metadata: { rideId: ride._id, tipAmount: parsedAmount },
        type: 'ALERT',
        actionLink: 'tip_sent',
        isPush: false,
      }),
      notifyUser({
        userId: driver.userId?._id,
        title: 'Tip Received',
        message: `You received a $${parsedAmount} tip! It will be included in your weekly payout`,
        module: 'payment',
        metadata: { rideId: ride._id, tipAmount: parsedAmount },
        type: 'ALERT',
        actionLink: 'tip_received',
      }),
    ]);

    return {
      success: true,
      tipAmount: parsedAmount,
      paymentIntentId: paymentIntentId || null,
      message: 'Tip added to driver wallet. Will be paid via weekly payout.',
    };
  } catch (error) {
    console.error(`TIP TRANSFER ERROR: ${error.message}`);
    return {
      success: false,
      error: error.message || 'Failed to transfer tip to driver',
    };
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
    const [
      existingDebitTx,
      existingCreditTx,
      existingAdminCommission,
      existingRideTransaction,
    ] = await Promise.all([
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
        status: 'COMPLETED',
      }),
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
      if (!originalTx)
        throw new Error('Failed to mark original payment as refunded');
      if (!adminCommission)
        throw new Error('Failed to mark admin commission as refunded');
      if (!rideTransaction)
        throw new Error('Failed to mark ride transaction as refunded');

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
          { session },
        );
        refundRemaining -= pendingUsed;
      }

      if (refundRemaining > 0) {
        await DriverWallet.findOneAndUpdate(
          { driverId: driver._id },
          { $inc: { negativeBalance: refundRemaining } },
          { session },
        );
      }

      // 4. Credit passenger wallet using direct update
      const refundAmount = amount + adminCommission.commissionAmount;
      await PassengerWallet.findOneAndUpdate(
        { passengerId: passenger._id },
        { $inc: { availableBalance: refundAmount } },
        { session },
      );

      // 5. Log refund transactions atomically using direct model creation
      await Promise.all([
        TransactionModel.create(
          [
            {
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
                refundType: 'WALLET_REFUND',
              },
              status: 'succeeded',
              referenceId: `wallet_refund_${rideId}_${Date.now()}`,
              receiptUrl: passengerWallet._id,
            },
          ],
          { session },
        ).then((res) => res[0]),

        TransactionModel.create(
          [
            {
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
                refundType: 'WALLET_REFUND',
              },
              status: 'succeeded',
              referenceId: `wallet_refund_${rideId}_${Date.now()}`,
              receiptUrl: driverWallet._id,
            },
          ],
          { session },
        ).then((res) => res[0]),

        RefundTransaction.create(
          [
            {
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
                originalAmount: amount,
              },
            },
          ],
          { session },
        ).then((res) => res[0]),
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
      amountDeductedFromDriver: amount,
    };
  } catch (error) {
    console.error(`WALLET REFUND FAILED: ${error.message}`);

    // Send failure notification
    try {
      const originalTx = await TransactionModel.findOne({
        rideId,
        type: 'DEBIT',
        isRefunded: false,
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
