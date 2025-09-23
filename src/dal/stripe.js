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
  // const paymentIntent = await stripe.paymentIntents.create({
  //   amount: amount * 100,
  //   currency: 'cad',
  //   customer: passenger.stripeCustomerId,
  //   payment_method: paymentMethodId,
  //   off_session: true,
  //   confirm: true,
  // });

  const paymentIntent = await stripe.paymentIntents.create({
    amount: amount * 100,
    currency: 'cad',
    customer: passenger.stripeCustomerId,
    payment_method: 'pm_card_visa', // Stripe test card
    off_session: true,
    confirm: true,
    automatic_payment_methods: {
      enabled: true,
      allow_redirects: 'never', // prevent redirect-based PMs
    },
  });

  const wallet = await increaseWalletBalance(passenger._id, amount);

  await createTransaction({
    passengerId: passenger._id,
    walletId: wallet._id,
    type: 'CREDIT',
    category,
    amount,
    metadata: paymentIntent,
    status: paymentIntent.status || 'failed',
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

    const payment = await stripe.transfers.create({
      amount: amount * 100,
      currency: 'cad',
      destination: driver.stripeAccountId,
    });

    await decreaseWalletBalance(passenger._id, amount);

    const transaction = await createTransaction({
      passengerId: passenger._id,
      driverId: driver._id,
      ride: ride._id,
      walletId: wallet._id,
      type: 'DEBIT',
      category,
      amount,
      metadata: payment,
      status: payment.balance_transaction ? 'succeeded' : 'failed',
      referenceId: payment.id,
      receiptUrl: payment.id,
    });

    return { payment, transaction };
  } catch (error) {
    console.error(`SOCKET ERROR in payDriverFromWallet: ${error}`);
    return { error: error.message }; // ✅ Always return an object
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
    transfer_data: {
      destination: driver.stripeAccountId,
    },
  });

  console.log(payment);

  const transaction = await createTransaction({
    passengerId: passenger._id,
    driverId: driver._id,
    rideId: ride._id,
    type: 'DEBIT',
    category,
    amount,
    metadata: payment,
    status: payment.charges.data[0].status || 'failed',
    referenceId: payment.id,
    receiptUrl: payment.charges.data[0].receipt_url || '',
  });

  return { payment, transaction };
};

// Driver Flow
export const createDriverStripeAccount = async (user, driver) => {
  const account = await stripe.accounts.create({
    type: 'express',
    country: 'CA', // ✅ Use Canada
    email: user.email,
    business_type: 'individual',
    capabilities: {
      transfers: { requested: true },
    },
  });

  await DriverModel.findByIdAndUpdate(driver._id, {
    stripeAccountId: account.id,
  });
  return account.id;
};

export const generateDriverOnboardingLink = async (driver) => {
  return await stripe.accountLinks.create({
    account: driver.stripeAccountId,
    refresh_url: 'https://yourapp.com/driver/onboarding-error',
    return_url: 'https://yourapp.com/driver/onboarding-complete',
    type: 'account_onboarding',
  });
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

export const transferToDriverBank = async (driver, amount) => {
  const payout = await stripe.payouts.create({
    amount: amount * 100, // cents
    currency: 'cad',
    destination: driver.defaultAccountId,
    stripe_account: driver.stripeAccountId, // important!
  });

  return payout;
};
