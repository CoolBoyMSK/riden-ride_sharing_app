import Stripe from 'stripe';
import env from '../config/envConfig.js';
const stripe = new Stripe(env.STRIPE_SECRET_KEY);
import PassengerModel from '../models/Passenger.js';
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

// Passenger Flow
export const createPassengerStripeCustomer = async (passenger) => {
  const customer = await stripe.customers.create({
    name: passenger.name,
    email: passenger.email,
  });

  passenger.stripeCustomerId = customer.id;
  await passenger.save();
  return customer.id;
};

export const addPassengerPaymentMethod = async (
  passenger,
  paymentMethodData,
) => {
  console.log(paymentMethodData);
  // 1. Create PaymentMethod
  const paymentMethod = await stripe.paymentMethods.create({
    type: paymentMethodData.type,
    card: { token: 'tok_amex' }, // tok_mastercard, tok_amex, tok_visa
    billing_details: {
      name: paymentMethodData.name,
      email: paymentMethodData.email,
    },
  });

  // 2. Attach PaymentMethod to Customer
  await stripe.paymentMethods.attach(paymentMethod.id, {
    customer: passenger.stripeCustomerId,
  });

  // 3. Optionally set as default
  await stripe.customers.update(passenger.stripeCustomerId, {
    invoice_settings: { default_payment_method: paymentMethod.id },
  });

  // 4. Save in DB for reference
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

export const deletePassengerCard = async (passengerId, paymentMethodId) => {
  // Detach the payment method from the customer
  const detachedPaymentMethod =
    await stripe.paymentMethods.detach(paymentMethodId);

  await updatePassengerPaymentMethod(passengerId, paymentMethodId);
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

export const setDefaultCard = async (customerId, paymentMethodId) => {
  // 1️⃣ Attach payment method if not already attached
  // await stripe.paymentMethods.attach(paymentMethodId, {
  //   customer: customerId,
  // });

  // 2️⃣ Set as default payment method
  const updatedCustomer = await stripe.customers.update(customerId, {
    invoice_settings: {
      default_payment_method: paymentMethodId,
    },
  });

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
export const createDriverStripeAccount = async (driver) => {
  const account = await stripe.accounts.create({
    type: 'express', // express or custom account
    country: 'US',
    email: driver.email,
    business_type: 'individual',
  });

  driver.stripeAccountId = account.id;
  await driver.save();
  return account.id;
};

export const addDriverBankAccount = async (driver, bankAccountData) => {
  const bankAccount = await stripe.accounts.createExternalAccount(
    driver.stripeAccountId,
    {
      external_account: bankAccountData, // token or object
    },
  );

  return bankAccount;
};

// {
//   object: 'bank_account',
//   country: 'US',
//   currency: 'usd',
//   routing_number: '110000000',
//   account_number: '000123456789',
//   account_holder_name: 'Jenny Rosen',
//   account_holder_type: 'individual',
// };

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
