import Stripe from 'stripe';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import PayoutRequestModel from '../models/InstantPayoutRequest.js';
import TransactionModel from '../models/Transaction.js';
import PassengerModel from '../models/Passenger.js';
import DriverModel from '../models/Driver.js';
import WalletModel from '../models/Wallet.js';
import PayoutModel from '../models/Payout.js';
import RideModel from '../models/Ride.js';
import env from '../config/envConfig.js';

const stripe = new Stripe(env.STRIPE_SECRET_KEY);

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

export const createWallet = async (passengerId) =>
  WalletModel.create({ passengerId });

export const getWallet = async (passengerId) =>
  WalletModel.findOne({ passengerId });

const increaseWalletBalance = async (passengerId, amount) =>
  WalletModel.findOneAndUpdate(
    { passengerId },
    { $inc: { balance: amount } },
    { new: true },
  );

const decreaseWalletBalance = async (passengerId, amount) =>
  WalletModel.findOneAndUpdate(
    { passengerId },
    { $inc: { balance: -amount } },
    { new: true },
  );

const createTransaction = async (payload) => TransactionModel.create(payload);

export const getDefaultCard = async (stripeCustomerId) =>
  PassengerModel.findOne({ stripeCustomerId }).select('defaultCardId').lean();

export const setDefaultCard = async (stripeCustomerId, defaultCardId) =>
  PassengerModel.findOneAndUpdate(
    { stripeCustomerId },
    { defaultCardId },
    { new: true },
  );

export const getDefaultAccount = async (stripeAccountId) =>
  DriverModel.findOne({ stripeAccountId }).select('defaultAccountId').lean();

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
    rides,
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

  const wallet = await increaseWalletBalance(passenger._id, amount);

  await createTransaction({
    passengerId: passenger._id,
    walletId: wallet._id,
    type: 'CREDIT',
    category,
    amount,
    metadata: paymentIntent,
    status: paymentIntent.status,
    referenceId: paymentIntent.id,
    receiptUrl: paymentIntent.id,
  });

  return paymentIntent;
};

export const payDriverFromWallet = async (
  passenger,
  driver,
  ride,
  amount,
  category,
) => {
  try {
    const wallet = await getWallet(passenger._id);
    if (!wallet) throw new Error('Wallet not found');
    if (wallet.balance < amount) throw new Error('Insufficient wallet balance');

    await decreaseWalletBalance(passenger._id, amount);

    const transaction = await createTransaction({
      passengerId: passenger._id,
      driverId: driver._id,
      rideId: ride._id,
      walletId: wallet._id,
      type: 'DEBIT',
      category,
      amount,
      metadata: {},
      status: 'succeeded',
      referenceId: wallet._id,
      receiptUrl: wallet._id,
    });

    await createTransaction({
      passengerId: passenger._id,
      driverId: driver._id,
      rideId: ride._id,
      walletId: wallet._id,
      type: 'CREDIT',
      category: 'PAYOUT',
      amount,
      metadata: {},
      status: 'succeeded',
      referenceId: wallet._id,
      receiptUrl: wallet._id,
    });

    return { success: true, transaction };
  } catch (error) {
    console.error(`ERROR in payDriverFromWallet: ${error}`);
    return { error: error.message };
  }
};

export const passengerPaysDriver = async (
  passenger,
  driver,
  ride,
  amount,
  paymentMethodId,
  category,
) => {
  const payment = await stripe.paymentIntents.create({
    amount: amount * 100,
    currency: 'cad',
    customer: passenger.stripeCustomerId,
    payment_method: paymentMethodId,
    off_session: true,
    confirm: true,
  });

  const transaction = await createTransaction({
    passengerId: passenger._id,
    driverId: driver._id,
    rideId: ride._id,
    type: 'DEBIT',
    category,
    amount,
    metadata: payment,
    status: payment.status || 'failed',
    referenceId: payment.id,
    receiptUrl: payment.id,
  });

  await createTransaction({
    passengerId: passenger._id,
    driverId: driver._id,
    rideId: ride._id,
    type: 'CREDIT',
    category: 'PAYOUT',
    amount,
    metadata: payment,
    status: payment.status || 'failed',
    referenceId: payment.id,
    receiptUrl: payment.id,
  });

  return { payment, transaction };
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
  ).lean();

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
  console.log(account);

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

export const instantPayoutDriver = async (driver, requestId) => {
  const balance = await getDriverUnpaidBalance(driver._id);
  if (balance.unpaidBalance <= 10)
    throw new Error('Payout must be greater than $10');

  const transfer = await stripe.transfers.create({
    amount: Math.round(balance.unpaidBalance * 100),
    currency: 'cad',
    destination: driver.stripeAccountId,
    description: `Driver payout transfer`,
  });

  const payout = await stripe.payouts.create(
    {
      amount: Math.round(balance.unpaidBalance * 100),
      currency: 'cad',
    },
    {
      stripeAccount: driver.stripeAccountId,
    },
  );

  await createPayout(
    driver._id,
    balance.unpaidBalance,
    'INSTANT',
    balance.rideIds,
    requestId,
    'SUCCESS',
  );

  await createTransaction({
    driverId: driver._id,
    type: 'DEBIT',
    category: 'INSTANT-PAYOUT',
    amount: balance.unpaidBalance,
    metadata: { transfer, payout },
    status: 'succeeded',
    referenceId: payout.id,
    receiptUrl: payout.id,
  });

  await createTransaction({
    driverId: driver._id,
    type: 'CREDIT',
    category: 'INSTANT-PAYOUT',
    amount: balance.unpaidBalance,
    metadata: { transfer, payout },
    status: 'succeeded',
    referenceId: payout.id,
    receiptUrl: payout.id,
  });

  return { transfer, payout };
};

export const createPayoutRequest = async (driverId) => {
  const { unpaidBalance, rideIds } = await getDriverUnpaidBalance(driverId);

  if (unpaidBalance <= 9.99) {
    throw new Error('Unpaid balance must be at least $10');
  }

  const payoutRequest = await PayoutRequestModel.create({
    driverId,
    amount: unpaidBalance,
    rides: rideIds,
  });

  return payoutRequest;
};
