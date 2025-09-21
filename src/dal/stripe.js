import Stripe from 'stripe';
import env from '../config/envConfig.js';
const stripe = new Stripe(env.STRIPE_SECRET_KEY);
import PassengerModel from '../models/Passenger.js';
import DriverModel from '../models/Driver.js';
import WalletModel from '../models/Wallet.js';
import TransactionModel from '../models/Transaction.js';

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

const createRideTransaction = async (
  passengerId,
  driverId,
  rideId,
  walletId,
  type,
  amount,
  metadata,
  status,
  referenceId,
  receiptUrl,
) =>
  TransactionModel.create({
    passengerId,
    driverId,
    rideId,
    walletId,
    type,
    amount,
    metadata,
    status,
    referenceId,
    receiptUrl,
  });

const createWalletTransaction = async (
  passengerId,
  walletId,
  type,
  amount,
  metadata,
  status,
  referenceId,
  receiptUrl,
) =>
  TransactionModel.create({
    passengerId,
    walletId,
    type,
    amount,
    metadata,
    status,
    referenceId,
    receiptUrl,
  });

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
  const paymentMethod = await stripe.paymentMethods.create({
    type: paymentMethodData.type,
    card: { token: 'tok_amex' }, // tok_mastercard, tok_amex, tok_visa
    billing_details: {
      name: paymentMethodData.name,
      email: paymentMethodData.email,
    },
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

export const addFundsToWallet = async (passenger, amount, paymentMethodId) => {
  const paymentIntent = await stripe.paymentIntents.create({
    amount: amount * 100,
    currency: 'usd',
    customer: passenger.stripeCustomerId,
    payment_method: paymentMethodId,
    off_session: true,
    confirm: true,
  });

  const wallet = await increaseWalletBalance(passenger._id, amount);

  await createWalletTransaction(
    passenger._id,
    wallet._id,
    'CREDIT',
    amount,
    paymentIntent,
    paymentIntent.status || 'failed',
    paymentIntent.id,
    // paymentIntent.charges.data[0].receipt_url || '',
    paymentIntent.id, // for testing
  );

  return paymentIntent;
};

export const payDriverFromWallet = async (passenger, driver, ride, amount) => {
  const wallet = await getWallet(passenger._id);
  if (wallet.balance < amount) throw new Error('Insufficient wallet balance');

  await decreaseWalletBalance(passenger._id, amount);

  const transfer = await stripe.transfers.create({
    amount: amount * 100,
    currency: 'usd',
    destination: driver.stripeAccountId,
  });

  await createRideTransaction(
    passenger._id,
    driver._id,
    ride._id,
    wallet._id,
    'DEBIT',
    amount,
    transfer,
    transfer.balance_transaction ? 'succeeded' : 'failed',
    transfer.id,
  );

  return transfer;
};

export const passengerPaysDriver = async (
  passenger,
  driver,
  ride,
  amount,
  paymentMethodId,
) => {
  const paymentIntent = await stripe.paymentIntents.create({
    amount: amount * 100,
    currency: 'usd',
    customer: passenger.stripeCustomerId,
    payment_method: paymentMethodId,
    off_session: true,
    confirm: true,
    transfer_data: {
      destination: driver.stripeAccountId,
    },
  });

  await createRideTransaction(
    passenger._id,
    driver._id,
    ride._id,
    'DEBIT',
    amount,
    paymentIntent,
    paymentIntent.charges.data[0].status || 'failed',
    paymentIntent.id,
    paymentIntent.charges.data[0].receipt_url || '',
  );

  return paymentIntent;
};

// Driver Flow
export const createDriverStripeAccount = async (user, driver) => {
  const account = await stripe.accounts.create({
    type: 'express',
    country: 'US',
    email: user.email,
    business_type: 'individual',
  });

  await DriverModel.findByIdAndUpdate(driver._id, {
    stripeAccountId: account.id,
  });

  return account.id;
};

export const addDriverExternalAccount = async (driver, bankAccountData) => {
  const bankAccount = await stripe.accounts.createExternalAccount(
    driver.stripeAccountId,
    {
      external_account: bankAccountData,
    },
  );

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
  stripeAccountId,
  externalAccountId,
) => {
  const deletedAccount = await stripe.accounts.deleteExternalAccount(
    stripeAccountId,
    externalAccountId,
  );

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

export const transferToDriverBank = async (driver, amount) => {
  const payout = await stripe.payouts.create({
    amount: amount * 100, // cents
    currency: 'usd',
    destination: driver.stripeDefaultBankAccountId,
    stripe_account: driver.stripeAccountId, // important!
  });

  return payout;
};
