# Stripe Google Pay aur Apple Pay ke saath Payment Hold Implementation Guide

## Overview

Yeh documentation Stripe ke through Google Pay aur Apple Pay payments ko hold karne aur ride complete hone par release karne ke liye complete implementation guide hai.

## Table of Contents

1. [Payment Flow Overview](#payment-flow-overview)
2. [Google Pay / Apple Pay Setup](#google-pay--apple-pay-setup)
3. [Payment Hold (Authorization)](#payment-hold-authorization)
4. [Payment Capture (Ride Complete)](#payment-capture-ride-complete)
5. [Payment Hold Cancel (Ride Cancel)](#payment-hold-cancel-ride-cancel)
6. [API Endpoints](#api-endpoints)
7. [Code Implementation](#code-implementation)
8. [Error Handling](#error-handling)
9. [Testing](#testing)

---

## Payment Flow Overview

### Complete Payment Flow:

```
1. User Ride Book Karta Hai
   ↓
2. Payment Hold (Authorization) - Funds hold ho jate hain Stripe par
   ↓
3. Ride Start / In Progress
   ↓
4. Ride Complete
   ↓
5. Payment Capture - Hold ki hui payment capture ho jati hai
   ↓
6. Payment Stripe Account mein transfer
```

### Payment States:

- **AUTHORIZED**: Payment hold ho chuki hai, lekin capture nahi hui
- **CAPTURED**: Payment capture ho chuki hai aur Stripe account mein transfer ho chuki hai
- **CANCELLED**: Payment hold cancel ho chuki hai (ride cancel hone par)

---

## Google Pay / Apple Pay Setup

### 1. Setup Intent Create Karna

**Endpoint**: `POST /api/user/passenger/payment/setup-wallet-intent?walletType=GOOGLE_PAY` or `APPLE_PAY`

**Request**:

```javascript
// Query Parameters
{
  walletType: 'GOOGLE_PAY' | 'APPLE_PAY';
}
```

**Response**:

```javascript
{
  success: true,
  data: {
    clientSecret: "seti_xxxxx_secret_xxxxx",
    setupIntentId: "seti_xxxxx"
  }
}
```

**Implementation** (Already exists in `src/dal/stripe.js`):

```javascript
export const setupPassengerWalletIntent = async (
  user,
  passenger,
  walletType,
) => {
  // Creates Setup Intent for Google Pay / Apple Pay
  // Returns clientSecret for frontend integration
};
```

### 2. Frontend Integration

Frontend par Stripe Elements use karke Google Pay / Apple Pay button render karein:

```javascript
// React Example
import { loadStripe } from '@stripe/stripe-js';
import {
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';

const stripePromise = loadStripe('YOUR_PUBLISHABLE_KEY');

function PaymentSetup() {
  const stripe = useStripe();
  const elements = useElements();

  const handleSetup = async () => {
    // 1. Get setupIntent from backend
    const response = await fetch(
      '/api/user/passenger/payment/setup-wallet-intent?walletType=GOOGLE_PAY',
    );
    const { data } = await response.json();

    // 2. Confirm setup with Stripe
    const { error, setupIntent } = await stripe.confirmSetup({
      elements,
      clientSecret: data.clientSecret,
      confirmParams: {
        payment_method_data: {
          type: 'card',
        },
      },
    });

    if (error) {
      console.error(error);
    } else {
      // Setup successful
      console.log('Payment method saved:', setupIntent.payment_method);
    }
  };

  return (
    <PaymentElement
      options={{
        paymentMethodTypes: ['card'],
        wallets: {
          applePay: 'auto',
          googlePay: 'auto',
        },
      }}
    />
  );
}
```

---

## Payment Hold (Authorization)

### Ride Booking ke waqt Payment Hold

Jab user ride book karta hai, tab payment hold karni hai (authorize without capture).

**Function**: `holdRidePayment` (Already exists in `src/dal/stripe.js`)

**Usage**:

```javascript
import { holdRidePayment } from '../dal/stripe.js';

// Ride booking ke waqt
const holdResult = await holdRidePayment(
  passenger, // Passenger object
  estimatedFare, // Amount to hold (estimated fare)
  paymentMethodId, // Google Pay / Apple Pay payment method ID
  'GOOGLE_PAY', // or 'APPLE_PAY' or 'CARD'
);

if (holdResult.success) {
  // Payment hold successful
  // Store paymentIntentId in ride document
  ride.paymentIntentId = holdResult.paymentIntentId;
  ride.paymentStatus = 'AUTHORIZED';
  await ride.save();
}
```

**Function Implementation** (Already exists):

```javascript
export const holdRidePayment = async (
  passenger,
  amount,
  paymentMethodId,
  paymentMethodType = 'CARD',
) => {
  // Creates Payment Intent with capture_method: 'manual'
  // This holds funds without capturing them
  const paymentIntent = await stripe.paymentIntents.create({
    amount: Math.round(amount * 100), // Convert to cents
    currency: 'cad',
    customer: passenger.stripeCustomerId,
    payment_method: paymentMethodId,
    capture_method: 'manual', // ✅ Key: Hold without capture
    confirm: true, // Authorize immediately
    off_session: true,
    description: `Ride booking authorization (${paymentMethodType})`,
    metadata: {
      type: 'ride_authorization',
      paymentMethodType: paymentMethodType,
      passengerId: passenger._id.toString(),
    },
  });

  return {
    success: true,
    paymentIntentId: paymentIntent.id,
    status: paymentIntent.status, // Should be 'requires_capture'
  };
};
```

**Important Points**:

- `capture_method: 'manual'` - Payment hold hoti hai, capture nahi hoti
- `confirm: true` - Payment immediately authorize ho jati hai
- Status `requires_capture` hona chahiye
- Payment Intent ID ko ride document mein store karein

---

## Payment Capture (Ride Complete)

### Ride Complete hone par Payment Capture

Jab ride complete ho jaye, tab held payment ko capture karna hai.

**New Function to Add** (Add in `src/dal/stripe.js`):

```javascript
// Capture held payment when ride completes
export const captureHeldPayment = async (
  paymentIntentId,
  amount, // Actual fare (might differ from estimated)
  rideId,
) => {
  try {
    if (!paymentIntentId) {
      throw new Error('Payment intent ID is required');
    }

    // Retrieve payment intent to check status
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status !== 'requires_capture') {
      throw new Error(
        `Payment intent is not in requires_capture state. Current status: ${paymentIntent.status}`,
      );
    }

    // If actual amount differs from authorized amount, update first
    const authorizedAmount = paymentIntent.amount / 100; // Convert from cents
    if (Math.abs(authorizedAmount - amount) > 0.01) {
      // Update payment intent with new amount
      await stripe.paymentIntents.update(paymentIntentId, {
        amount: Math.round(amount * 100),
      });
    }

    // Capture the payment
    const capturedPayment = await stripe.paymentIntents.capture(
      paymentIntentId,
      {
        amount_to_capture: Math.round(amount * 100), // Optional: capture specific amount
      },
    );

    if (capturedPayment.status !== 'succeeded') {
      throw new Error(
        `Payment capture failed. Status: ${capturedPayment.status}`,
      );
    }

    return {
      success: true,
      paymentIntentId: capturedPayment.id,
      status: capturedPayment.status,
      amount: amount,
      capturedAt: new Date(),
    };
  } catch (error) {
    console.error('Error capturing held payment:', error);
    return {
      success: false,
      error: error.message || 'Failed to capture payment',
      stripeError: error.type || null,
    };
  }
};
```

**Usage in Ride Complete Flow**:

```javascript
// In ride completion service (e.g., src/services/User/ride/rideTrackingService.js)
import { captureHeldPayment } from '../../../dal/stripe.js';
import { passengerPaysDriver } from '../../../dal/stripe.js';

export const completeRide = async (rideId, driverId, completionData) => {
  // ... existing ride completion logic ...

  const ride = await findRideByRideId(rideId);
  const actualFare = fareResult.actualFare;

  // If payment was held (authorized), capture it
  if (ride.paymentIntentId && ride.paymentStatus === 'AUTHORIZED') {
    const captureResult = await captureHeldPayment(
      ride.paymentIntentId,
      actualFare,
      rideId,
    );

    if (captureResult.success) {
      // Now process payment to driver
      const paymentResult = await passengerPaysDriver(
        passenger,
        driver,
        ride,
        driverAmount, // Driver's share
        actualFare, // Total amount
        ride.paymentMethodId,
        'RIDE',
      );

      // Update ride payment status
      await updateRideByRideId(rideId, {
        paymentStatus: 'COMPLETED',
        paymentIntentId: captureResult.paymentIntentId,
      });
    } else {
      // Handle capture failure
      throw new Error(`Payment capture failed: ${captureResult.error}`);
    }
  }

  // ... rest of completion logic ...
};
```

---

## Payment Hold Cancel (Ride Cancel)

### Ride Cancel hone par Payment Hold Release

Agar ride cancel ho jaye, tab held payment ko release karna hai.

**Function**: `cancelPaymentHold` (Already exists in `src/dal/stripe.js`)

**Usage**:

```javascript
import { cancelPaymentHold } from '../dal/stripe.js';

// Ride cancel ke waqt
if (ride.paymentIntentId && ride.paymentStatus === 'AUTHORIZED') {
  const cancelResult = await cancelPaymentHold(ride.paymentIntentId);

  if (cancelResult.success) {
    // Payment hold released successfully
    ride.paymentStatus = 'CANCELLED';
    await ride.save();
  }
}
```

**Function Implementation** (Already exists):

```javascript
export const cancelPaymentHold = async (paymentIntentId) => {
  // Cancels the payment intent to release the hold
  const cancelledIntent = await stripe.paymentIntents.cancel(paymentIntentId);

  return {
    success: true,
    paymentIntentId: cancelledIntent.id,
    status: cancelledIntent.status, // Should be 'canceled'
  };
};
```

---

## API Endpoints

### 1. Setup Google Pay / Apple Pay

**Endpoint**: `POST /api/user/passenger/payment/setup-wallet-intent`

**Query Parameters**:

- `walletType`: `GOOGLE_PAY` | `APPLE_PAY`

**Response**:

```json
{
  "success": true,
  "data": {
    "clientSecret": "seti_xxxxx_secret_xxxxx",
    "setupIntentId": "seti_xxxxx"
  }
}
```

### 2. Hold Payment (Ride Booking)

**Endpoint**: `POST /api/user/passenger/ride/book` (or your booking endpoint)

**Request Body**:

```json
{
  "pickupLocation": {...},
  "dropoffLocation": {...},
  "paymentMethodId": "pm_xxxxx",
  "paymentMethodType": "GOOGLE_PAY"
}
```

**Response**:

```json
{
  "success": true,
  "data": {
    "rideId": "ride_xxxxx",
    "paymentIntentId": "pi_xxxxx",
    "paymentStatus": "AUTHORIZED"
  }
}
```

### 3. Capture Payment (Ride Complete)

**Endpoint**: `POST /api/user/driver/ride/complete` (or your completion endpoint)

**Request Body**:

```json
{
  "rideId": "ride_xxxxx",
  "actualDistance": 10.5,
  "waitingTime": 5
}
```

**Response**:

```json
{
  "success": true,
  "data": {
    "rideId": "ride_xxxxx",
    "paymentStatus": "COMPLETED",
    "paymentIntentId": "pi_xxxxx"
  }
}
```

### 4. Cancel Payment Hold (Ride Cancel)

**Endpoint**: `POST /api/user/passenger/ride/cancel`

**Request Body**:

```json
{
  "rideId": "ride_xxxxx",
  "reason": "User cancelled"
}
```

**Response**:

```json
{
  "success": true,
  "data": {
    "rideId": "ride_xxxxx",
    "paymentStatus": "CANCELLED"
  }
}
```

---

## Code Implementation

### 1. Ride Model Update

Ride model mein payment hold information store karein:

```javascript
// src/models/Ride.js
const rideSchema = new mongoose.Schema({
  // ... existing fields ...

  paymentIntentId: {
    type: String,
    default: null,
  },

  paymentStatus: {
    type: String,
    enum: ['PENDING', 'AUTHORIZED', 'COMPLETED', 'CANCELLED', 'FAILED'],
    default: 'PENDING',
  },

  paymentMethodId: {
    type: String,
    default: null,
  },

  paymentMethodType: {
    type: String,
    enum: ['CARD', 'GOOGLE_PAY', 'APPLE_PAY', 'WALLET', 'CASH'],
    default: 'CARD',
  },

  // ... rest of schema ...
});
```

### 2. Ride Booking Service Update

```javascript
// src/services/User/ride/rideBookingService.js
import { holdRidePayment } from '../../../dal/stripe.js';

export const bookRide = async (user, bookingData) => {
  // ... existing booking logic ...

  const passenger = await findPassengerByUserId(user._id);
  const estimatedFare = calculateEstimatedFare(bookingData);

  // Hold payment if using Google Pay / Apple Pay / Card
  if (
    ['GOOGLE_PAY', 'APPLE_PAY', 'CARD'].includes(bookingData.paymentMethodType)
  ) {
    const holdResult = await holdRidePayment(
      passenger,
      estimatedFare,
      bookingData.paymentMethodId,
      bookingData.paymentMethodType,
    );

    if (!holdResult.success) {
      throw new Error(`Payment authorization failed: ${holdResult.error}`);
    }

    // Store payment intent ID in ride
    ride.paymentIntentId = holdResult.paymentIntentId;
    ride.paymentStatus = 'AUTHORIZED';
  }

  await ride.save();
  return ride;
};
```

### 3. Ride Completion Service Update

```javascript
// src/services/User/ride/rideTrackingService.js
import {
  captureHeldPayment,
  passengerPaysDriver,
} from '../../../dal/stripe.js';

export const completeRide = async (rideId, driverId, completionData) => {
  // ... existing completion logic ...

  const ride = await findRideByRideId(rideId);
  const actualFare = fareResult.actualFare;

  // Capture held payment if exists
  if (ride.paymentIntentId && ride.paymentStatus === 'AUTHORIZED') {
    const captureResult = await captureHeldPayment(
      ride.paymentIntentId,
      actualFare,
      rideId,
    );

    if (!captureResult.success) {
      throw new Error(`Payment capture failed: ${captureResult.error}`);
    }

    // Now process payment to driver
    const passenger = await findPassengerByUserId(ride.passengerId.userId);
    const driver = await findDriverById(driverId);

    const driverAmount = actualFare - adminCommission;

    const paymentResult = await passengerPaysDriver(
      passenger,
      driver,
      ride,
      driverAmount,
      actualFare,
      ride.paymentMethodId,
      'RIDE',
    );

    if (!paymentResult.success) {
      throw new Error(`Payment processing failed: ${paymentResult.error}`);
    }

    // Update ride payment status
    ride.paymentStatus = 'COMPLETED';
  }

  await ride.save();
  return ride;
};
```

### 4. Ride Cancellation Service Update

```javascript
// src/services/User/ride/rideCancellationService.js
import { cancelPaymentHold } from '../../../dal/stripe.js';

export const cancelRide = async (rideId, userId, reason) => {
  // ... existing cancellation logic ...

  const ride = await findRideByRideId(rideId);

  // Cancel payment hold if exists
  if (ride.paymentIntentId && ride.paymentStatus === 'AUTHORIZED') {
    const cancelResult = await cancelPaymentHold(ride.paymentIntentId);

    if (cancelResult.success) {
      ride.paymentStatus = 'CANCELLED';
    }
  }

  await ride.save();
  return ride;
};
```

---

## Error Handling

### Common Errors aur Solutions:

1. **Payment Authorization Failed**
   - **Error**: `Payment authorization failed`
   - **Solution**: Check payment method validity, sufficient funds, card details

2. **Payment Capture Failed**
   - **Error**: `Payment intent is not in requires_capture state`
   - **Solution**: Ensure payment was authorized first, check payment intent status

3. **Payment Hold Already Released**
   - **Error**: `Payment hold already released`
   - **Solution**: Check if payment was already captured or cancelled

4. **Insufficient Funds**
   - **Error**: `card_declined` or `insufficient_funds`
   - **Solution**: Notify user, allow alternative payment method

### Error Handling Example:

```javascript
try {
  const holdResult = await holdRidePayment(
    passenger,
    amount,
    paymentMethodId,
    'GOOGLE_PAY',
  );

  if (!holdResult.success) {
    // Handle specific errors
    if (holdResult.stripeError === 'card_declined') {
      throw new Error(
        'Card was declined. Please use a different payment method.',
      );
    } else if (holdResult.stripeError === 'insufficient_funds') {
      throw new Error('Insufficient funds. Please add funds to your account.');
    } else {
      throw new Error(holdResult.error);
    }
  }
} catch (error) {
  console.error('Payment hold error:', error);
  // Notify user
  // Log error
  // Return appropriate response
}
```

---

## Testing

### Test Scenarios:

1. **Google Pay Setup**
   - ✅ Setup intent create karein
   - ✅ Frontend par Google Pay button show ho
   - ✅ Payment method save ho

2. **Apple Pay Setup**
   - ✅ Setup intent create karein
   - ✅ Frontend par Apple Pay button show ho
   - ✅ Payment method save ho

3. **Payment Hold**
   - ✅ Ride book karte waqt payment hold ho
   - ✅ Payment status `AUTHORIZED` ho
   - ✅ Payment Intent ID save ho

4. **Payment Capture**
   - ✅ Ride complete hone par payment capture ho
   - ✅ Payment status `COMPLETED` ho
   - ✅ Driver ko payment transfer ho

5. **Payment Hold Cancel**
   - ✅ Ride cancel hone par payment hold release ho
   - ✅ Payment status `CANCELLED` ho
   - ✅ Funds user ke account mein wapas ho

### Test Cases:

```javascript
// Test Payment Hold
describe('Payment Hold', () => {
  it('should hold payment on ride booking', async () => {
    const result = await holdRidePayment(
      passenger,
      50.0,
      'pm_xxxxx',
      'GOOGLE_PAY',
    );

    expect(result.success).toBe(true);
    expect(result.status).toBe('requires_capture');
  });
});

// Test Payment Capture
describe('Payment Capture', () => {
  it('should capture payment on ride completion', async () => {
    const result = await captureHeldPayment(
      'pi_xxxxx',
      55.0, // Actual fare (different from estimated)
      'ride_xxxxx',
    );

    expect(result.success).toBe(true);
    expect(result.status).toBe('succeeded');
  });
});

// Test Payment Cancel
describe('Payment Cancel', () => {
  it('should cancel payment hold on ride cancellation', async () => {
    const result = await cancelPaymentHold('pi_xxxxx');

    expect(result.success).toBe(true);
    expect(result.status).toBe('canceled');
  });
});
```

---

## Important Notes

1. **Payment Intent Expiry**: Stripe payment intents expire after 7 days if not captured. Ensure capture within this timeframe.

2. **Amount Differences**: Agar actual fare estimated fare se different hai, payment intent ko update karein before capture.

3. **Idempotency**: Payment operations mein idempotency keys use karein to avoid duplicate charges.

4. **Webhooks**: Stripe webhooks setup karein to handle payment events (payment_intent.succeeded, payment_intent.canceled, etc.)

5. **Security**: Payment method IDs ko securely store karein, never expose sensitive card details.

6. **Testing**: Stripe test mode use karein development ke liye. Test cards use karein Google Pay / Apple Pay testing ke liye.

---

## Summary

Yeh implementation guide Stripe ke through Google Pay aur Apple Pay payments ko hold karne aur ride complete hone par release karne ke liye complete solution provide karta hai:

1. ✅ Google Pay / Apple Pay setup
2. ✅ Payment hold (authorization) on ride booking
3. ✅ Payment capture on ride completion
4. ✅ Payment hold cancel on ride cancellation
5. ✅ Error handling
6. ✅ Testing guidelines

Is implementation ko follow karke aap safely Google Pay aur Apple Pay payments ko hold kar sakte hain aur ride complete hone par capture kar sakte hain.
