// import Stripe from 'stripe';
// import mongoose from 'mongoose';
// import PayoutRequestModel from '../models/InstantPayoutRequest.js';
// import TransactionModel from '../models/Transaction.js';
// import PassengerModel from '../models/Passenger.js';
// import DriverModel from '../models/Driver.js';
// import WalletModel from '../models/Wallet.js';
// import PayoutModel from '../models/Payout.js';
// import RideModel from '../models/Ride.js';
// import env from '../config/envConfig.js';
// import { notifyUser } from '../dal/notification.js';

// const stripe = new Stripe(env.STRIPE_SECRET_KEY);

// const savePassengerPaymentMethod = async (passengerId, cardId) =>
//   PassengerModel.findByIdAndUpdate(
//     passengerId,
//     { $push: { paymentMethodIds: cardId } },
//     { new: true },
//   );

// const updatePassengerPaymentMethod = async (passengerId, cardId) =>
//   PassengerModel.findByIdAndUpdate(
//     passengerId,
//     {
//       $pull: { paymentMethodIds: { $in: [cardId] } },
//     },
//     { new: true },
//   );

// const saveDriverPayoutMethod = async (driverId, accountId) =>
//   DriverModel.findByIdAndUpdate(
//     driverId,
//     { $push: { payoutMethodIds: accountId } },
//     { new: true },
//   );

// const updateDriverPayoutMethod = async (driverId, accountId) =>
//   PassengerModel.findByIdAndUpdate(
//     driverId,
//     {
//       $pull: { payoutMethodIds: { $in: [accountId] } },
//     },
//     { new: true },
//   );

// export const createWallet = async (passengerId) =>
//   WalletModel.create({ passengerId });

// export const getPassengerWallet = async (passengerId) =>
//   WalletModel.findOne({ passengerId });

// const increaseWalletBalance = async (passengerId, amount) =>
//   WalletModel.findOneAndUpdate(
//     { passengerId },
//     { $inc: { balance: amount } },
//     { new: true },
//   );

// const decreaseWalletBalance = async (passengerId, amount) =>
//   WalletModel.findOneAndUpdate(
//     { passengerId },
//     { $inc: { balance: -amount } },
//     { new: true },
//   );

// const getDriverBalance = async (driverId) =>
//   DriverModel.findById(driverId).select('balance').lean();

// const increaseDriverBalance = async (driverId, amount) =>
//   DriverModel.findByIdAndUpdate(
//     driverId,
//     { $inc: { balance: amount } },
//     { new: true },
//   );

// const decreaseDriverBalance = async (driverId, amount) =>
//   DriverModel.findByIdAndUpdate(
//     driverId,
//     { $inc: { balance: -amount } },
//     { new: true },
//   );

// const createTransaction = async (payload) => TransactionModel.create(payload);

// export const findTransaction = async (payload) =>
//   TransactionModel.findOne(payload).lean();

// export const getDefaultCard = async (stripeCustomerId) =>
//   PassengerModel.findOne({ stripeCustomerId }).select('defaultCardId').lean();

// export const setDefaultCard = async (stripeCustomerId, defaultCardId) =>
//   PassengerModel.findOneAndUpdate(
//     { stripeCustomerId },
//     { defaultCardId },
//     { new: true },
//   );

// export const getDefaultAccount = async (stripeAccountId) =>
//   DriverModel.findOne({ stripeAccountId }).select('defaultAccountId').lean();

// export const setDefaultAccount = async (stripeAccountId, defaultAccountId) =>
//   DriverModel.findOneAndUpdate(
//     { stripeAccountId },
//     { defaultAccountId },
//     { new: true },
//   );

// export const createPayout = async (
//   driverId,
//   amount,
//   payoutType,
//   rides,
//   payoutRequestId,
//   status,
// ) =>
//   PayoutModel.create({
//     driverId,
//     amount,
//     payoutType,
//     rides: rides || [],
//     payoutRequestId,
//     status,
//   });

// export const getDriverUnpaidBalance = async (driverId) => {
//   const completedRides = await RideModel.aggregate([
//     {
//       $match: {
//         driverId: new mongoose.Types.ObjectId(driverId),
//         status: 'RIDE_COMPLETED',
//         paymentStatus: 'COMPLETED',
//       },
//     },
//     {
//       $project: {
//         rideId: '$_id',
//         fare: { $ifNull: ['$actualFare', 0] },
//         tip: { $ifNull: ['$tipBreakdown.amount', 0] },
//         isDestinationRide: 1,
//       },
//     },
//     {
//       $addFields: {
//         platformFee: {
//           $cond: [
//             { $eq: ['$isDestinationRide', true] },
//             { $multiply: ['$fare', 0.45] }, // ✅ fee only on fare
//             { $multiply: ['$fare', 0.25] },
//           ],
//         },
//         totalRideEarnings: { $add: ['$fare', '$tip'] }, // fare + tip
//       },
//     },
//     {
//       $group: {
//         _id: null,
//         rideIds: { $push: '$rideId' }, // ✅ collect ride IDs
//         totalEarnings: { $sum: '$totalRideEarnings' }, // fare + tip
//         totalTips: { $sum: '$tip' },
//         totalFares: { $sum: '$fare' },
//         totalPlatformFees: { $sum: '$platformFee' },
//         rideCount: { $sum: 1 },
//       },
//     },
//   ]);

//   const totalEarnings = completedRides[0]?.totalEarnings || 0;
//   const totalFares = completedRides[0]?.totalFares || 0;
//   const totalTips = completedRides[0]?.totalTips || 0;
//   const totalPlatformFees = completedRides[0]?.totalPlatformFees || 0;
//   const rideIds = completedRides[0]?.rideIds || [];

//   // ✅ driver gets: (fare - platformFee) + full tips
//   const netEarnings = totalFares - totalPlatformFees + totalTips;
//   const rideCount = completedRides[0]?.rideCount || 0;

//   return {
//     totalFares,
//     totalTips,
//     totalPlatformFees,
//     totalEarnings, // fares + tips before deductions
//     netEarnings, // after deducting platform fee (tips untouched)
//     rideCount,
//     rideIds, // ✅ return unpaid ride IDs
//     unpaidBalance: netEarnings,
//   };
// };

// export const createInstantPayoutRequest = async (driverId, amount, rideIds) =>
//   PayoutRequestModel.create({
//     driverId,
//     amount,
//     rides: rideIds || [],
//   });

// const updateRequestedPayoutStatus = async (requestId) =>
//   PayoutRequestModel.findByIdAndUpdate(
//     requestId,
//     { status: 'APPROVED', approvedAt: new Date() },
//     { new: true },
//   );

// const updateInstantPayoutStatuses = async (driverId) => {
//   return await PayoutRequestModel.updateMany(
//     { driverId, status: 'PENDING' },
//     { $set: { status: 'REJECTED' } },
//   );
// };

// export const findDriverHistory = async (driverId) => {
//   return await DriverModel.findById(driverId).select('rideIds');
// };

// export const deleteDriverHistory = async (driverId) => {
//   return await DriverModel.findByIdAndUpdate(
//     driverId,
//     { $set: { rideIds: [] } },
//     { new: true },
//   );
// };

// // Passenger Flow
// export const createPassengerStripeCustomer = async (user, passenger) => {
//   const customer = await stripe.customers.create({
//     name: user.name,
//     email: user.email,
//   });

//   passenger.stripeCustomerId = customer.id;
//   await passenger.save();
//   return customer.id;
// };

// export const addPassengerPaymentMethod = async (
//   passenger,
//   paymentMethodData,
// ) => {
//   // const paymentMethod = await stripe.paymentMethods.create({
//   //   type: paymentMethodData.type,
//   //   card: { token: '4000000000000077' }, // tok_mastercard, tok_amex, tok_visa, 4000000000000077
//   //   billing_details: {
//   //     name: paymentMethodData.name,
//   //     email: paymentMethodData.email,
//   //   },
//   // });
//   const paymentMethod = await stripe.paymentMethods.create({
//     type: 'card',
//     card: { token: 'tok_visa' },
//   });

//   await stripe.paymentMethods.attach(paymentMethod.id, {
//     customer: passenger.stripeCustomerId,
//   });

//   const card = await getDefaultCard(passenger.stripeCustomerId);
//   if (!card.defaultCardId) {
//     await stripe.customers.update(passenger.stripeCustomerId, {
//       invoice_settings: { default_payment_method: paymentMethod.id },
//     });

//     await setDefaultCard(passenger.stripeCustomerId, paymentMethod.id);
//   }

//   await savePassengerPaymentMethod(passenger._id, paymentMethod.id);

//   return paymentMethod.id;
// };

// export const getPassengerCards = async (passenger) => {
//   const paymentMethods = await stripe.paymentMethods.list({
//     customer: passenger.stripeCustomerId,
//     type: 'card',
//   });

//   return paymentMethods.data; // array of card objects
// };

// export const getCardDetails = async (paymentMethodId) => {
//   const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
//   return paymentMethod;
// };

// export const deletePassengerCard = async (passenger, paymentMethodId) => {
//   const detachedPaymentMethod =
//     await stripe.paymentMethods.detach(paymentMethodId);

//   await updatePassengerPaymentMethod(passenger._id, paymentMethodId);

//   const card = await getDefaultCard(passenger.stripeCustomerId);
//   if (card.defaultCardId === paymentMethodId) {
//     await setDefaultCard(passenger.stripeCustomerId, null);
//   }

//   return detachedPaymentMethod;
// };

// export const updatePassengerCard = async (paymentMethodId, updates) => {
//   const updatedPaymentMethod = await stripe.paymentMethods.update(
//     paymentMethodId,
//     {
//       billing_details: {
//         name: updates.name,
//         email: updates.email,
//         address: updates.address,
//       },
//       metadata: updates.metadata || {},
//     },
//   );

//   return updatedPaymentMethod;
// };

// export const setDefaultPassengerCard = async (customerId, paymentMethodId) => {
//   const updatedCustomer = await stripe.customers.update(customerId, {
//     invoice_settings: {
//       default_payment_method: paymentMethodId,
//     },
//   });

//   await setDefaultCard(customerId, paymentMethodId);

//   return updatedCustomer;
// };

// export const addFundsToWallet = async (
//   passenger,
//   amount,
//   paymentMethodId,
//   category,
// ) => {
//   const paymentIntent = await stripe.paymentIntents.create({
//     amount: amount * 100,
//     currency: 'cad',
//     customer: passenger.stripeCustomerId,
//     payment_method: paymentMethodId,
//     confirm: true,
//     off_session: true,
//   });

//   if (paymentIntent.status !== 'succeeded') {
//     throw new Error('Top-up failed');
//   }

//   const wallet = await increaseWalletBalance(passenger._id, amount);

//   const transaction = await createTransaction({
//     passengerId: passenger._id,
//     walletId: wallet._id,
//     type: 'CREDIT',
//     category,
//     amount,
//     for: 'passenger',
//     metadata: paymentIntent,
//     status: paymentIntent.status,
//     referenceId: paymentIntent.id,
//     receiptUrl: paymentIntent.id,
//   });

//   // Notification Logic Start
//   const notify = await notifyUser({
//     userId: passenger.userId,
//     title: 'Payment Done 🎉',
//     message: `Payment successful! $${amount} has been added to your Riden wallet.`,
//     module: 'payment',
//     metadata: transaction,
//     type: 'ALERT',
//     actionLink: `${env.FRONTEND_URL}/api/user/passenger/payment-method/wallet`,
//   });
//   if (!notify) {
//     throw new Error('Failed to send notification');
//   }
//   // Notification Logic End

//   return paymentIntent;
// };

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
//     if (!wallet) throw new Error('Wallet not found');

//     const parsedAmount = Number(amount);
//     if (isNaN(parsedAmount) || parsedAmount <= 0) {
//       throw new Error('Invalid amount provided');
//     }

//     if (wallet.balance < parsedAmount) {
//       throw new Error('Insufficient wallet balance');
//     }

//     await decreaseWalletBalance(passenger._id, parsedAmount);
//     await increaseDriverBalance(driver._id, parsedAmount);

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

// export const passengerPaysDriver = async (
//   passenger,
//   driver,
//   ride,
//   amount,
//   actualAmount,
//   paymentMethodId,
//   category,
// ) => {
//   try {
//     const payment = await stripe.paymentIntents.create({
//       amount: amount * 100,
//       currency: 'cad',
//       customer: passenger.stripeCustomerId,
//       payment_method: paymentMethodId,
//       off_session: true,
//       confirm: true,
//     });

//     await increaseDriverBalance(driver._id, amount);

//     const transaction = await createTransaction({
//       passengerId: passenger._id,
//       driverId: driver._id,
//       rideId: ride._id,
//       type: 'DEBIT',
//       category,
//       amount: actualAmount,
//       for: 'passenger',
//       metadata: payment,
//       status: payment.status || 'failed',
//       referenceId: payment.id,
//       receiptUrl: payment.id,
//     });

//     await createTransaction({
//       passengerId: passenger._id,
//       driverId: driver._id,
//       rideId: ride._id,
//       type: 'CREDIT',
//       category: 'PAYOUT',
//       amount,
//       for: 'driver',
//       metadata: payment,
//       status: payment.status || 'failed',
//       referenceId: payment.id,
//       receiptUrl: payment.id,
//     });

//     // --- Notification Logic Start (Success) ---
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

//     return { success: true, payment, transaction };
//   } catch (error) {
//     console.error('Payment failed:', error.message);

//     try {
//       await notifyUser({
//         userId: passenger.userId,
//         title: '⚠️ Payment Failed',
//         message:
//           'We couldn’t process your payment. Please check your card details or try again later.',
//         module: 'payment',
//         metadata: { error: error.message, rideId: ride?._id },
//         type: 'ALERT',
//         actionLink: `${env.FRONTEND_URL}/ride?rideId=${ride?._id}`,
//       });
//     } catch (notifyError) {
//       console.error(
//         '⚠️ Failed to send payment failure notification:',
//         notifyError.message,
//       );
//     }

//     return {
//       success: false,
//       message: 'Payment processing failed.',
//       error: error.message,
//     };
//   }
// };

// // Driver Flow
// export const createDriverStripeAccount = async (user, driver) => {
//   const account = await stripe.accounts.create({
//     type: 'custom', // or 'express'
//     country: 'CA',
//     email: user.email,
//     capabilities: {
//       transfers: { requested: true },
//       card_payments: { requested: true },
//     },
//   });

//   await DriverModel.findByIdAndUpdate(driver._id, {
//     stripeAccountId: account.id,
//   });
//   return account.id;
// };

// export const onboardDriverStripeAccount = async (
//   user,
//   driver,
//   data,
//   userIP,
// ) => {
//   const account = await stripe.accounts.update(driver.stripeAccountId, {
//     business_type: 'individual',
//     business_profile: {
//       mcc: '4121',
//       product_description: 'Ride-hailing and transportation services',
//       url: 'https://api.riden.online/api',
//     },
//     individual: {
//       first_name: data.first_name,
//       last_name: data.last_name,
//       dob: data.dob,
//       email: user.email,
//       phone: '+14165550000',
//       address: {
//         line1: data.address.line1,
//         city: data.address.city,
//         state: data.address.state,
//         postal_code: data.address.postal_code,
//         country: data.address.country,
//       },
//       relationship: {
//         title: 'Driver',
//       },
//     },
//     tos_acceptance: {
//       date: Math.floor(Date.now() / 1000),
//       ip: userIP || '127.0.0.1',
//     },
//   });

//   await DriverModel.findByIdAndUpdate(
//     driver._id,
//     { isVerified: true },
//     { new: true },
//   ).lean();

//   return account.id;
// };

// export const uploadAdditionalDocument = async (accountId, file) => {
//   const stripeFile = await stripe.files.create({
//     purpose: 'identity_document',
//     file: {
//       data: file.buffer, // buffer from multer
//       name: file.originalname, // keep the uploaded filename
//       type: file.mimetype, // actual mimetype
//     },
//   });

//   // Attach to connected account
//   const account = await stripe.accounts.update(accountId, {
//     individual: {
//       verification: {
//         additional_document: {
//           // front: stripeFile.id,
//           front: 'file_identity_document_success',
//         },
//       },
//     },
//   });

//   return account;
// };

// export const uploadLicenseFront = async (accountId, file) => {
//   const stripeFile = await stripe.files.create({
//     purpose: 'identity_document',
//     file: {
//       data: file.buffer, // buffer from multer
//       name: file.originalname, // keep the uploaded filename
//       type: file.mimetype, // actual mimetype
//     },
//   });

//   // Attach to connected account
//   const account = await stripe.accounts.update(accountId, {
//     individual: {
//       verification: {
//         document: {
//           // front: stripeFile.id,
//           front: 'file_identity_document_success',
//         },
//       },
//     },
//   });

//   return account;
// };

// export const uploadLicenseBack = async (accountId, file) => {
//   const stripeFile = await stripe.files.create({
//     purpose: 'identity_document',
//     file: {
//       data: file.buffer, // buffer from multer
//       name: file.originalname, // keep the uploaded filename
//       type: file.mimetype, // actual mimetype
//     },
//   });

//   // Attach to connected account
//   const account = await stripe.accounts.update(accountId, {
//     individual: {
//       verification: {
//         document: {
//           // back: stripeFile.id,
//           back: 'file_identity_document_success',
//         },
//       },
//     },
//   });

//   return account;
// };

// export const createDriverVerification = async (driver) => {
//   const session = await stripe.identity.verificationSessions.create({
//     type: 'document',
//     options: {
//       document: {
//         require_id_number: true,
//         require_live_capture: true,
//       },
//     },
//     metadata: {
//       driverId: driver._id.toString(),
//       accountId: driver.stripeAccountId,
//     },
//   });

//   return {
//     sessionId: session.id,
//     url: session.url,
//   };
// };

// export const findVerificationStatus = async (sessionId) => {
//   const session =
//     await stripe.identity.verificationSessions.retrieve(sessionId);

//   return {
//     status: session.status,
//     verified: session.status === 'verified',
//     verifiedFiles: session.verified_outputs ?? null,
//     verifiedOutputs: session.verified_outputs ?? null,
//   };
// };

// export const checkConnectedAccountStatus = async (accountId) => {
//   const account = await stripe.accounts.retrieve(accountId);

//   return {
//     accountId: account.id,
//     chargesEnabled: account.charges_enabled,
//     payoutsEnabled: account.payouts_enabled,
//     detailsSubmitted: account.details_submitted,
//     requirements: {
//       currentlyDue: account.requirements?.currently_due || [],
//       eventuallyDue: account.requirements?.eventually_due || [],
//       pastDue: account.requirements?.past_due || [],
//       pendingVerification: account.requirements?.pending_verification || [],
//       errors: account.requirements?.errors || [],
//     },
//   };
// };

// export const addDriverExternalAccount = async (driver, bankAccountData) => {
//   const bankAccount = await stripe.accounts.createExternalAccount(
//     driver.stripeAccountId,
//     {
//       external_account: bankAccountData,
//     },
//   );

//   await saveDriverPayoutMethod(driver._id, bankAccount.id);

//   const account = await getDefaultAccount(driver.stripeAccountId);
//   if (!account.defaultAccountId) {
//     await setDefaultAccount(driver.stripeAccountId, bankAccount.id);
//   }
//   return bankAccount;
// };

// export const getAllExternalAccounts = async (stripeAccountId) => {
//   const externalAccounts =
//     await stripe.accounts.listExternalAccounts(stripeAccountId);
//   return externalAccounts;
// };

// export const getExternalAccountById = async (
//   stripeAccountId,
//   externalAccountId,
// ) => {
//   const externalAccount = await stripe.accounts.retrieveExternalAccount(
//     stripeAccountId,
//     externalAccountId,
//   );
//   return externalAccount;
// };

// export const updateExternalAccount = async (
//   stripeAccountId,
//   externalAccountId,
//   updates,
// ) => {
//   const updatedAccount = await stripe.accounts.updateExternalAccount(
//     stripeAccountId,
//     externalAccountId,
//     updates,
//   );
//   return updatedAccount;
// };

// export const deleteExternalAccount = async (
//   driver,
//   stripeAccountId,
//   externalAccountId,
// ) => {
//   const deletedAccount = await stripe.accounts.deleteExternalAccount(
//     stripeAccountId,
//     externalAccountId,
//   );

//   await updateDriverPayoutMethod(driver._id, externalAccountId);

//   const account = await getDefaultAccount(stripeAccountId);
//   if (account.defaultAccountId === externalAccountId) {
//     await setDefaultAccount(stripeAccountId, null);
//   }
//   return deletedAccount;
// };

// export const setDefaultExternalAccount = async (
//   stripeAccountId,
//   externalAccountId,
// ) => {
//   const updatedAccount = await stripe.accounts.updateExternalAccount(
//     stripeAccountId,
//     externalAccountId,
//     { default_for_currency: true },
//   );

//   await setDefaultAccount(stripeAccountId, externalAccountId);
//   return updatedAccount;
// };

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

// export const createPayoutRequest = async (driverId) => {
//   const driverBalance = await getDriverBalance(driverId);
//   const rides = await findDriverHistory(driverId);

//   if (driverBalance.balance <= 9.99) {
//     throw new Error('Unpaid balance must be at least $10');
//   }

//   const payoutRequest = await createInstantPayoutRequest(
//     driverId,
//     driverBalance.balance,
//     rides.rideIds.length,
//   );

//   return payoutRequest;
// };

// // Admin Flow
// export const refundCardPaymentToPassenger = async (
//   rideId,
//   reason = 'Ride cancelled',
// ) => {
//   try {
//     // 1️⃣ Find the original successful transaction
//     const originalTx = await TransactionModel.findOne({
//       rideId,
//       type: 'DEBIT',
//       for: 'passenger',
//       status: 'succeeded',
//     });

//     if (!originalTx) throw new Error('Original payment not found for refund');

//     const { passengerId, driverId, amount, referenceId } = originalTx;

//     // 2️⃣ Fetch related entities
//     const passenger = await getUserById(passengerId);
//     const driver = await getDriverById(driverId);

//     if (!passenger || !driver) throw new Error('Passenger or Driver not found');

//     // 3️⃣ Process refund through Stripe
//     const refund = await stripe.refunds.create({
//       payment_intent: referenceId, // Stripe payment intent ID
//       amount: amount * 100, // refund same amount, in cents
//       reason: 'requested_by_customer',
//     });

//     if (!refund || refund.status !== 'succeeded')
//       throw new Error('Stripe refund failed');

//     // 4️⃣ Adjust balances
//     await decreaseDriverBalance(driver._id, amount);

//     // 5️⃣ Log refund transactions
//     await createTransaction({
//       passengerId,
//       driverId,
//       rideId,
//       type: 'CREDIT',
//       category: 'REFUND',
//       amount,
//       for: 'passenger',
//       metadata: refund,
//       status: refund.status,
//       referenceId: refund.id,
//       receiptUrl: refund.receipt_url || refund.id,
//     });

//     await createTransaction({
//       passengerId,
//       driverId,
//       rideId,
//       type: 'DEBIT',
//       category: 'REFUND',
//       amount,
//       for: 'driver',
//       metadata: refund,
//       status: refund.status,
//       referenceId: refund.id,
//       receiptUrl: refund.receipt_url || refund.id,
//     });

//     // 6️⃣ Notify both users
//     await notifyUser({
//       userId: passenger.userId,
//       title: '💸 Refund Issued',
//       message: `A refund of $${amount} has been processed for your ride.`,
//       module: 'refund',
//       metadata: { rideId, refundId: refund.id, reason },
//       type: 'ALERT',
//       actionLink: `${env.FRONTEND_URL}/ride?rideId=${rideId}`,
//     });

//     await notifyUser({
//       userId: driver.userId,
//       title: '⚠️ Refund Deducted',
//       message: `A refund of $${amount} has been deducted for ride ${rideId}. Reason: ${reason}.`,
//       module: 'refund',
//       metadata: { rideId, refundId: refund.id, reason },
//       type: 'ALERT',
//       actionLink: `${env.FRONTEND_URL}/ride?rideId=${rideId}`,
//     });

//     return {
//       success: true,
//       message: 'Refund processed successfully',
//       refund,
//     };
//   } catch (error) {
//     console.error(`Refund failed: ${error.message}`);

//     try {
//       await notifyUser({
//         userId: passenger?.userId,
//         title: '❌ Refund Failed',
//         message: `We couldn’t process your refund. ${error.message}`,
//         module: 'refund',
//         metadata: { rideId, error: error.message },
//         type: 'ALERT',
//         actionLink: `${env.FRONTEND_URL}/support`,
//       });
//     } catch (notifyErr) {
//       console.error(
//         '❌ Failed to send refund failure notification:',
//         notifyErr,
//       );
//     }

//     return { success: false, error: error.message };
//   }
// };

// export const refundWalletPaymentToPassenger = async (
//   rideId,
//   reason = 'Ride cancelled',
// ) => {
//   // 1. Find original successful transaction
//   const originalTx = await TransactionModel.findOne({
//     rideId,
//     type: 'DEBIT',
//     status: 'succeeded',
//     for: 'passenger',
//   });

//   if (!originalTx) throw new Error('Original payment not found');

//   const { passengerId, driverId, amount, walletId } = originalTx;

//   // 2. Get entities
//   const passenger = await PassengerModel.findById(passengerId);
//   const driver = await DriverModel.findById(driverId);
//   const wallet = await getPassengerWallet(passengerId);
//   if (!wallet) throw new Error('Passenger wallet not found');

//   // 3. Ensure driver has enough balance for refund
//   if (driver.balance < amount) {
//     throw new Error('Driver has insufficient balance for refund');
//   }

//   try {
//     // 4. Reverse balances
//     await decreaseDriverBalance(driverId, amount);
//     await increaseWalletBalance(passengerId, amount);

//     // 5. Log refund transactions
//     await createTransaction({
//       passengerId,
//       driverId,
//       rideId,
//       walletId,
//       type: 'CREDIT', // money goes back to passenger
//       category: 'REFUND',
//       amount,
//       for: 'passenger',
//       metadata: { reason },
//       status: 'succeeded',
//       referenceId: rideId,
//       receiptUrl: walletId,
//     });

//     await createTransaction({
//       passengerId,
//       driverId,
//       rideId,
//       walletId,
//       type: 'DEBIT', // money taken from driver
//       category: 'REFUND',
//       amount,
//       for: 'driver',
//       metadata: { reason },
//       status: 'succeeded',
//       referenceId: rideId,
//       receiptUrl: walletId,
//     });

//     // 6. Notify both users
//     await notifyUser({
//       userId: passenger.userId,
//       title: '💸 Refund Processed',
//       message: `Your refund of PKR ${amount} for ride ${rideId} has been processed successfully.`,
//       module: 'refund',
//       metadata: { rideId, reason },
//       type: 'ALERT',
//       actionLink: `${env.FRONTEND_URL}/wallet`,
//     });

//     await notifyUser({
//       userId: driver.userId,
//       title: '⚠️ Refund Deducted',
//       message: `A refund of PKR ${amount} has been deducted for ride ${rideId}. Reason: ${reason}.`,
//       module: 'refund',
//       metadata: { rideId, reason },
//       type: 'ALERT',
//       actionLink: `${env.FRONTEND_URL}/rides/${rideId}`,
//     });

//     return { success: true, message: 'Refund completed successfully' };
//   } catch (error) {
//     console.error(`Refund Failed: ${error.message}`);

//     // Notify passenger about failure
//     try {
//       await notifyUser({
//         userId: passenger?.userId,
//         title: '❌ Refund Failed',
//         message: `We couldn’t process your refund. ${error.message}`,
//         module: 'refund',
//         metadata: { rideId, error: error.message },
//         type: 'ALERT',
//         actionLink: `${env.FRONTEND_URL}/support`,
//       });
//     } catch (notifyErr) {
//       console.error(
//         '❌ Failed to send refund failure notification:',
//         notifyErr,
//       );
//     }

//     return { error: error.message };
//   }
// };

import Stripe from 'stripe';
import mongoose from 'mongoose';
import PayoutRequestModel from '../models/InstantPayoutRequest.js';
import TransactionModel from '../models/Transaction.js';
import DriverWallet from '../models/DriverWallet.js';
import DriverPayout from '../models/DriverPayout.js';
import PassengerModel from '../models/Passenger.js';
import DriverModel from '../models/Driver.js';
import WalletModel from '../models/Wallet.js';
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
  WalletModel.create({ passengerId });

export const getPassengerWallet = async (passengerId) =>
  WalletModel.findOne({ passengerId });

const increasePassengerAvailableBalance = async (passengerId, amount) =>
  WalletModel.findOneAndUpdate(
    { passengerId },
    { $inc: { availableBalance: amount } },
    { new: true },
  );

const decreasePassengerAvailableBalance = async (passengerId, amount) =>
  WalletModel.findOneAndUpdate(
    { passengerId },
    { $inc: { availableBalance: -amount } },
    { new: true },
  );

const increasePassengerNegativeBalance = async (passengerId, amount) =>
  WalletModel.findOneAndUpdate(
    { passengerId },
    { $inc: { negativeBalance: amount } },
    { new: true },
  );

const decreasePassengerNegativeBalance = async (passengerId, amount) =>
  WalletModel.findOneAndUpdate(
    { passengerId },
    { $inc: { negativeBalance: -amount } },
    { new: true },
  );

export const createDriverWallet = async (driverId) =>
  DriverWallet.create({ driverId });

const getDriverBalance = async (driverId) =>
  DriverWallet.findOne({ driverId }).lean();

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
  TransactionModel.findOne(payload).lean();

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

  const wallet = await getPassengerWallet(passenger._id);
  if (wallet.negativeBalance === 0) {
    await increasePassengerAvailableBalance(passenger._id, amount);
  }
  if (wallet.negativeBalance > 0) {
    let negative = wallet.negativeBalance;
    amount = amount - negative;
    if (amount < 0) {
      negative = abs(amount);
      await increasePassengerNegativeBalance(passenger._id, negative);
    } else if (amount >= 0) {
      await increasePassengerAvailableBalance(passenger._id, amount);
    }
  }

  const transaction = await createTransaction({
    passengerId: passenger._id,
    walletId: wallet._id,
    type: 'CREDIT',
    category,
    amount,
    for: 'passenger',
    metadata: paymentIntent,
    status: paymentIntent.status,
    referenceId: paymentIntent.id,
    receiptUrl: paymentIntent.id,
  });

  // Notification Logic Start
  const notify = await notifyUser({
    userId: passenger.userId,
    title: 'Payment Done 🎉',
    message: `Payment successful! $${amount} has been added to your Riden wallet.`,
    module: 'payment',
    metadata: transaction,
    type: 'ALERT',
    actionLink: `${env.FRONTEND_URL}/api/user/passenger/payment-method/wallet`,
  });
  if (!notify) {
    throw new Error('Failed to send notification');
  }
  // Notification Logic End

  return paymentIntent;
};

export const payDriverFromWallet = async (
  passenger,
  driver,
  ride,
  amount,
  actualAmount,
  category,
) => {
  try {
    const wallet = await getPassengerWallet(passenger._id);
    if (!wallet) throw new Error('Passenger wallet not found');

    let parsedAmount = Number(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      throw new Error('Invalid amount provided');
    }

    if (wallet.availableBalance < parsedAmount) {
      throw new Error('Insufficient wallet balance');
    }

    const driverWallet = await getDriverBalance(driver._id);
    if (!driverWallet) throw new Error('Driver wallet not found');

    await decreasePassengerAvailableBalance(passenger._id, parsedAmount);

    if (driverWallet.negativeBalance > 0) {
      const negative = driverWallet.negativeBalance;

      if (parsedAmount >= negative) {
        // Enough to clear all negative balance
        await decreaseDriverNegativeBalance(driver._id, negative);
        driverWallet.negativeBalance = 0;

        const remaining = parsedAmount - negative;
        if (remaining > 0) {
          await increaseDriverPendingBalance(driver._id, remaining);
        }
      } else {
        // Not enough to clear all negative balance
        await decreaseDriverNegativeBalance(driver._id, parsedAmount);
        driverWallet.negativeBalance = negative - parsedAmount;
      }
    } else {
      // No negative balance — normal case
      await increaseDriverPendingBalance(driver._id, parsedAmount);
    }

    const transaction = await createTransaction({
      passengerId: passenger._id,
      driverId: driver._id,
      rideId: ride._id,
      walletId: wallet._id,
      type: 'DEBIT',
      category,
      for: 'passenger',
      amount: actualAmount,
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
      for: 'driver',
      metadata: {},
      status: 'succeeded',
      referenceId: wallet._id,
      receiptUrl: wallet._id,
    });

    const notify = await notifyUser({
      userId: passenger.userId,
      title: '✅ Payment Successful!',
      message: `Thanks for riding with RIDEN. Your payment of $${amount} was completed successfully. Receipt is available in your ride history.`,
      module: 'payment',
      metadata: ride,
      type: 'ALERT',
      actionLink: `${env.FRONTEND_URL}/ride?rideId=${ride._id}`,
    });

    const notifyDriver = await notifyUser({
      userId: driver.userId,
      title: '💰 Payment Received',
      message: `You’ve received ${amount} for your recent ride.`,
      module: 'payment',
      metadata: ride,
      type: 'ALERT',
      actionLink: `${env.FRONTEND_URL}/ride?rideId=${ride._id}`,
    });

    if (!notify || !notifyDriver) {
      console.log('Failed to send notification');
    }

    return { success: true, transaction };
  } catch (error) {
    console.error(`Payment Failed: ${error.message}`);

    // 🔔 Failure Notification
    try {
      await notifyUser({
        userId: passenger.userId,
        title: '❌ Payment Failed',
        message: `We couldn’t complete your wallet payment of PKR ${amount}. ${error.message}. Please try again.`,
        module: 'payment',
        metadata: { rideId: ride?._id, error: error.message },
        type: 'ALERT',
        actionLink: `${env.FRONTEND_URL}/wallet`,
      });
    } catch (notifyErr) {
      console.error(
        '❌ Failed to send payment failure notification:',
        notifyErr,
      );
    }

    return { error: error.message };
  }
};

export const passengerPaysDriver = async (
  passenger,
  driver,
  ride,
  amount,
  actualAmount,
  paymentMethodId,
  category,
) => {
  try {
    const driverWallet = await getDriverBalance(driver._id);
    if (!driverWallet) throw new Error('Driver wallet not found');

    const payment = await stripe.paymentIntents.create({
      amount: amount * 100,
      currency: 'cad',
      customer: passenger.stripeCustomerId,
      payment_method: paymentMethodId,
      off_session: true,
      confirm: true,
    });

    if (driverWallet.negativeBalance > 0) {
      const negative = driverWallet.negativeBalance;

      if (amount >= negative) {
        // Enough to clear all negative balance
        await decreaseDriverNegativeBalance(driver._id, negative);
        driverWallet.negativeBalance = 0;

        const remaining = amount - negative;
        if (remaining > 0) {
          await increaseDriverPendingBalance(driver._id, remaining);
        }
      } else {
        // Not enough to clear all negative balance
        await decreaseDriverNegativeBalance(driver._id, amount);
        driverWallet.negativeBalance = negative - amount;
      }
    } else {
      // No negative balance — normal case
      await increaseDriverPendingBalance(driver._id, amount);
    }

    const transaction = await createTransaction({
      passengerId: passenger._id,
      driverId: driver._id,
      rideId: ride._id,
      type: 'DEBIT',
      category,
      amount: actualAmount,
      for: 'passenger',
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
      for: 'driver',
      metadata: payment,
      status: payment.status || 'failed',
      referenceId: payment.id,
      receiptUrl: payment.id,
    });

    // --- Notification Logic Start (Success) ---
    const notify = await notifyUser({
      userId: passenger.userId,
      title: '✅ Payment Successful!',
      message: `Thanks for riding with RIDEN. Your payment of $${amount} was completed successfully. Receipt is available in your ride history.`,
      module: 'payment',
      metadata: ride,
      type: 'ALERT',
      actionLink: `${env.FRONTEND_URL}/ride?rideId=${ride._id}`,
    });

    const notifyDriver = await notifyUser({
      userId: driver.userId,
      title: '💰 Payment Received',
      message: `You’ve received ${amount} for your recent ride.`,
      module: 'payment',
      metadata: ride,
      type: 'ALERT',
      actionLink: `${env.FRONTEND_URL}/ride?rideId=${ride._id}`,
    });

    if (!notify || !notifyDriver) {
      console.log('Failed to send notification');
    }

    return { success: true, payment, transaction };
  } catch (error) {
    console.error('Payment failed:', error.message);

    try {
      await notifyUser({
        userId: passenger.userId,
        title: '⚠️ Payment Failed',
        message:
          'We couldn’t process your payment. Please check your card details or try again later.',
        module: 'payment',
        metadata: { error: error.message, rideId: ride?._id },
        type: 'ALERT',
        actionLink: `${env.FRONTEND_URL}/ride?rideId=${ride?._id}`,
      });
    } catch (notifyError) {
      console.error(
        '⚠️ Failed to send payment failure notification:',
        notifyError.message,
      );
    }

    return {
      success: false,
      message: 'Payment processing failed.',
      error: error.message,
    };
  }
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

  if (driverBalance.balance <= 9.99) {
    throw new Error('Unpaid balance must be at least $10');
  }

  const payoutRequest = await createInstantPayoutRequest(
    driverId,
    driverBalance.balance,
    rides.rideIds.length,
  );

  return payoutRequest;
};

// Admin Flow
export const instantPayoutDriver = async (driver, requestId) => {
  const balance = driver.balance;
  if (balance <= 10) throw new Error('Payout must be greater than $10');

  const transfer = await stripe.transfers.create({
    amount: Math.round(balance * 100),
    currency: 'cad',
    destination: driver.stripeAccountId,
    description: `Driver payout transfer`,
  });

  const payout = await stripe.payouts.create(
    {
      amount: Math.round(balance * 100),
      currency: 'cad',
    },
    {
      stripeAccount: driver.stripeAccountId,
    },
  );

  const rides = await findDriverHistory(driver._id);
  await updateRequestedPayoutStatus(requestId);
  await updateInstantPayoutStatuses(driver._id);

  await createPayout(
    driver._id,
    balance,
    'INSTANT',
    rides.rideIds.length,
    requestId,
    'SUCCESS',
  );

  await Promise.all([
    deleteDriverHistory(driver._id),
    decreaseDriverBalance(driver._id, balance),
    createTransaction({
      driverId: driver._id,
      type: 'DEBIT',
      category: 'INSTANT-PAYOUT',
      amount: balance,
      for: 'admin',
      metadata: { transfer, payout },
      status: 'succeeded',
      referenceId: payout.id,
      receiptUrl: payout.id,
    }),
    createTransaction({
      driverId: driver._id,
      type: 'CREDIT',
      category: 'INSTANT-PAYOUT',
      amount: balance,
      for: 'driver',
      metadata: { transfer, payout },
      status: 'succeeded',
      referenceId: payout.id,
      receiptUrl: payout.id,
    }),
  ]);

  return { transfer, payout };
};

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
      metadata: { payout },
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
      metadata: { payout },
      status: 'succeeded',
      referenceId: transfer.id,
      receiptUrl: transfer.id,
    }),
  ]);

  return transfer;
};

export const payoutToDriverBank = async (driver, amount) => {
  if (!driver.stripeAccountId)
    throw new Error('Driver has no Stripe account linked');

  if (amount <= 10) throw new Error('Payout amount must be greater than $10');

  const wallet = await getDriverBalance(driver._id);
  if (wallet.availableBalance <= 10)
    throw new Error('Available balance amount must be greater than $10');

  if (amount > wallet.availableBalance)
    throw new Error('Insufficient funds for payout to driver bank account');

  const payout = await stripe.payouts.create(
    {
      amount: Math.round(amount * 100),
      currency: 'cad',
    },
    {
      stripeAccount: driver.stripeAccountId,
    },
  );

  await decreaseDriverAvailableBalance(driver._id, amount);

  return payout;
};

export const refundCardPaymentToPassenger = async (
  rideId,
  reason = 'Ride cancelled',
) => {
  try {
    // 1️⃣ Find the original successful transaction
    const originalTx = await TransactionModel.findOne({
      rideId,
      type: 'DEBIT',
      for: 'passenger',
      status: 'succeeded',
    });

    if (!originalTx) throw new Error('Original payment not found for refund');

    const { passengerId, driverId, amount, referenceId } = originalTx;

    // 2️⃣ Fetch related entities
    const passenger = await getUserById(passengerId);
    const driver = await getDriverById(driverId);

    if (!passenger || !driver) throw new Error('Passenger or Driver not found');

    // 3️⃣ Process refund through Stripe
    const refund = await stripe.refunds.create({
      payment_intent: referenceId, // Stripe payment intent ID
      amount: amount * 100, // refund same amount, in cents
      reason: 'requested_by_customer',
    });

    if (!refund || refund.status !== 'succeeded')
      throw new Error('Stripe refund failed');

    // 4️⃣ Adjust balances
    await decreaseDriverBalance(driver._id, amount);

    // 5️⃣ Log refund transactions
    await createTransaction({
      passengerId,
      driverId,
      rideId,
      type: 'CREDIT',
      category: 'REFUND',
      amount,
      for: 'passenger',
      metadata: refund,
      status: refund.status,
      referenceId: refund.id,
      receiptUrl: refund.receipt_url || refund.id,
    });

    await createTransaction({
      passengerId,
      driverId,
      rideId,
      type: 'DEBIT',
      category: 'REFUND',
      amount,
      for: 'driver',
      metadata: refund,
      status: refund.status,
      referenceId: refund.id,
      receiptUrl: refund.receipt_url || refund.id,
    });

    // 6️⃣ Notify both users
    await notifyUser({
      userId: passenger.userId,
      title: '💸 Refund Issued',
      message: `A refund of $${amount} has been processed for your ride.`,
      module: 'refund',
      metadata: { rideId, refundId: refund.id, reason },
      type: 'ALERT',
      actionLink: `${env.FRONTEND_URL}/ride?rideId=${rideId}`,
    });

    await notifyUser({
      userId: driver.userId,
      title: '⚠️ Refund Deducted',
      message: `A refund of $${amount} has been deducted for ride ${rideId}. Reason: ${reason}.`,
      module: 'refund',
      metadata: { rideId, refundId: refund.id, reason },
      type: 'ALERT',
      actionLink: `${env.FRONTEND_URL}/ride?rideId=${rideId}`,
    });

    return {
      success: true,
      message: 'Refund processed successfully',
      refund,
    };
  } catch (error) {
    console.error(`Refund failed: ${error.message}`);

    try {
      await notifyUser({
        userId: passenger?.userId,
        title: '❌ Refund Failed',
        message: `We couldn’t process your refund. ${error.message}`,
        module: 'refund',
        metadata: { rideId, error: error.message },
        type: 'ALERT',
        actionLink: `${env.FRONTEND_URL}/support`,
      });
    } catch (notifyErr) {
      console.error(
        '❌ Failed to send refund failure notification:',
        notifyErr,
      );
    }

    return { success: false, error: error.message };
  }
};

export const refundWalletPaymentToPassenger = async (
  rideId,
  reason = 'Ride cancelled',
) => {
  // 1. Find original successful transaction
  const originalTx = await TransactionModel.findOne({
    rideId,
    type: 'DEBIT',
    status: 'succeeded',
    for: 'passenger',
  });

  if (!originalTx) throw new Error('Original payment not found');

  const { passengerId, driverId, amount, walletId } = originalTx;

  // 2. Get entities
  const passenger = await PassengerModel.findById(passengerId);
  const driver = await DriverModel.findById(driverId);
  const wallet = await getPassengerWallet(passengerId);
  if (!wallet) throw new Error('Passenger wallet not found');

  // 3. Ensure driver has enough balance for refund
  if (driver.balance < amount) {
    throw new Error('Driver has insufficient balance for refund');
  }

  try {
    // 4. Reverse balances
    await decreaseDriverBalance(driverId, amount);
    await increaseWalletBalance(passengerId, amount);

    // 5. Log refund transactions
    await createTransaction({
      passengerId,
      driverId,
      rideId,
      walletId,
      type: 'CREDIT', // money goes back to passenger
      category: 'REFUND',
      amount,
      for: 'passenger',
      metadata: { reason },
      status: 'succeeded',
      referenceId: rideId,
      receiptUrl: walletId,
    });

    await createTransaction({
      passengerId,
      driverId,
      rideId,
      walletId,
      type: 'DEBIT', // money taken from driver
      category: 'REFUND',
      amount,
      for: 'driver',
      metadata: { reason },
      status: 'succeeded',
      referenceId: rideId,
      receiptUrl: walletId,
    });

    // 6. Notify both users
    await notifyUser({
      userId: passenger.userId,
      title: '💸 Refund Processed',
      message: `Your refund of PKR ${amount} for ride ${rideId} has been processed successfully.`,
      module: 'refund',
      metadata: { rideId, reason },
      type: 'ALERT',
      actionLink: `${env.FRONTEND_URL}/wallet`,
    });

    await notifyUser({
      userId: driver.userId,
      title: '⚠️ Refund Deducted',
      message: `A refund of PKR ${amount} has been deducted for ride ${rideId}. Reason: ${reason}.`,
      module: 'refund',
      metadata: { rideId, reason },
      type: 'ALERT',
      actionLink: `${env.FRONTEND_URL}/rides/${rideId}`,
    });

    return { success: true, message: 'Refund completed successfully' };
  } catch (error) {
    console.error(`Refund Failed: ${error.message}`);

    // Notify passenger about failure
    try {
      await notifyUser({
        userId: passenger?.userId,
        title: '❌ Refund Failed',
        message: `We couldn’t process your refund. ${error.message}`,
        module: 'refund',
        metadata: { rideId, error: error.message },
        type: 'ALERT',
        actionLink: `${env.FRONTEND_URL}/support`,
      });
    } catch (notifyErr) {
      console.error(
        '❌ Failed to send refund failure notification:',
        notifyErr,
      );
    }

    return { error: error.message };
  }
};
