import Stripe from 'stripe';
import env from '../config/envConfig.js';
const stripe = new Stripe(env.STRIPE_SECRET_KEY);

// Passenger Flow
async function createPassengerStripeCustomer(passenger) {
  const customer = await stripe.customers.create({
    name: passenger.name,
    email: passenger.email,
  });

  passenger.stripeCustomerId = customer.id;
  await passenger.save();
  return customer.id;
}

async function addPassengerPaymentMethod(passenger, paymentMethodData) {
  // 1. Create PaymentMethod
  const paymentMethod = await stripe.paymentMethods.create(paymentMethodData);

  // 2. Attach PaymentMethod to Customer
  await stripe.paymentMethods.attach(paymentMethod.id, {
    customer: passenger.stripeCustomerId,
  });

  // 3. Optionally set as default
  await stripe.customers.update(passenger.stripeCustomerId, {
    invoice_settings: { default_payment_method: paymentMethod.id },
  });

  // 4. Save in DB for reference
  await savePassengerPaymentMethod(passenger.id, paymentMethod.id);

  return paymentMethod.id;
}

// {
//   type: 'card',
//   card: {
//     number: '4242424242424242',
//     exp_month: 12,
//     exp_year: 2025,
//     cvc: '123',
//   }
// }

async function addFundsToWallet(passenger, amount, paymentMethodId) {
  // amount in cents
  const paymentIntent = await stripe.paymentIntents.create({
    amount: amount,
    currency: 'usd',
    customer: passenger.stripeCustomerId,
    payment_method: paymentMethodId,
    off_session: true,
    confirm: true,
  });

  // After success, update in-app wallet DB
  await increaseWalletBalance(passenger.id, amount / 100);
  return paymentIntent;
}

async function payDriverFromWallet(passenger, driver, amount) {
  // Deduct from passenger wallet
  const walletBalance = await getWalletBalance(passenger.id);
  if (walletBalance < amount) throw new Error('Insufficient wallet balance');

  await decreaseWalletBalance(passenger.id, amount);

  // Transfer to driver's Stripe balance
  await stripe.transfers.create({
    amount: amount * 100, // cents
    currency: 'usd',
    destination: driver.stripeAccountId,
  });
}

async function passengerPaysDriver(passenger, driver, amount, paymentMethodId) {
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

  return paymentIntent;
}

// Driver Flow

async function createDriverStripeAccount(driver) {
  const account = await stripe.accounts.create({
    type: 'express', // express or custom account
    country: 'US',
    email: driver.email,
    business_type: 'individual',
  });

  driver.stripeAccountId = account.id;
  await driver.save();
  return account.id;
}

async function addDriverBankAccount(driver, bankAccountData) {
  await stripe.accounts.createExternalAccount(driver.stripeAccountId, {
    external_account: bankAccountData, // token or object
  });
}

async function transferToDriverBank(driver, amount) {
  const payout = await stripe.payouts.create({
    amount: amount * 100, // cents
    currency: 'usd',
    destination: driver.stripeDefaultBankAccountId,
    stripe_account: driver.stripeAccountId, // important!
  });

  return payout;
}
