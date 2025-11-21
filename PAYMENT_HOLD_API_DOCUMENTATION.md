# Payment Hold APIs - Complete Documentation

## Overview

This document describes the complete API flow for Payment Hold functionality with Google Pay, Apple Pay, and Card payment methods. The implementation supports:

1. **Payment Hold (Authorization)** - Funds are held but not captured during ride booking
2. **Payment Capture** - Held payment is captured when ride completes
3. **Payment Hold Cancellation** - Payment hold is released when ride is cancelled

---

## Base URL

```
http://localhost:3000/api
```

Or for production:

```
https://api.riden.online/api
```

---

## Authentication

All endpoints require authentication. Include the JWT token in the Authorization header:

```
Authorization: Bearer {accessToken}
```

---

## API Endpoints

### 1. Payment Methods Management

#### Get All Payment Methods

```http
GET /api/user/passenger/payment-method/get
```

**Description:** Get all payment methods (Cards, Google Pay, Apple Pay) for the authenticated passenger.

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": "pm_xxxxx",
      "type": "card",
      "card": {
        "last4": "4242",
        "brand": "visa"
      },
      "paymentType": "CARD" // or "GOOGLE_PAY" or "APPLE_PAY"
    }
  ]
}
```

---

#### Add Card Payment Method

```http
POST /api/user/passenger/payment-method/add
```

**Body:**

```json
{
  "card": {
    "number": "4242424242424242",
    "exp_month": 12,
    "exp_year": 2025,
    "cvc": "123"
  },
  "billing_details": {
    "name": "John Doe",
    "email": "john@example.com",
    "address": {
      "line1": "123 Main St",
      "city": "Toronto",
      "state": "ON",
      "postal_code": "M5H 2N2",
      "country": "CA"
    }
  }
}
```

---

### 2. Google Pay & Apple Pay Setup

#### Setup Google Pay Intent

```http
POST /api/user/passenger/payment-method/wallet/add?walletType=GOOGLE_PAY
```

**Description:** Create a Setup Intent for Google Pay. Returns `clientSecret` and `setupIntentId` for frontend Stripe Elements integration.

**Response:**

```json
{
  "success": true,
  "data": {
    "clientSecret": "seti_xxxxx_secret_xxxxx",
    "setupIntentId": "seti_xxxxx"
  }
}
```

**Frontend Integration:** Use the `clientSecret` with Stripe Elements to show Google Pay button.

---

#### Setup Apple Pay Intent

```http
POST /api/user/passenger/payment-method/wallet/add?walletType=APPLE_PAY
```

**Description:** Create a Setup Intent for Apple Pay. Returns `clientSecret` and `setupIntentId` for frontend Stripe Elements integration.

**Response:**

```json
{
  "success": true,
  "data": {
    "clientSecret": "seti_xxxxx_secret_xxxxx",
    "setupIntentId": "seti_xxxxx"
  }
}
```

---

#### Delete Google Pay / Apple Pay

```http
DELETE /api/user/passenger/payment-method/wallet/delete?walletType=GOOGLE_PAY
DELETE /api/user/passenger/payment-method/wallet/delete?walletType=APPLE_PAY
```

**Query Parameters:**

- `walletType`: `GOOGLE_PAY` or `APPLE_PAY`

---

### 3. Ride Booking with Payment Hold

#### Get Fare Estimate

```http
POST /api/user/rides/estimate-fare
```

**Body:**

```json
{
  "pickupLocation": {
    "coordinates": [-79.3832, 43.6532],
    "address": "Toronto City Hall",
    "placeName": "City Hall"
  },
  "dropoffLocation": {
    "coordinates": [-79.3832, 43.6532],
    "address": "CN Tower",
    "placeName": "CN Tower"
  },
  "carType": "STANDARD",
  "promoCode": null
}
```

---

#### Book Ride with Card (Payment Hold)

```http
POST /api/user/rides/book
```

**Body:**

```json
{
  "pickupLocation": {
    "coordinates": [-79.3832, 43.6532],
    "address": "Toronto City Hall",
    "placeName": "City Hall"
  },
  "dropoffLocation": {
    "coordinates": [-79.3832, 43.6532],
    "address": "CN Tower",
    "placeName": "CN Tower"
  },
  "carType": "STANDARD",
  "paymentMethod": "CARD",
  "cardId": "pm_xxxxx",
  "bookedFor": "ME",
  "promoCode": null,
  "specialRequests": null
}
```

**Response:**

```json
{
  "success": true,
  "message": "Ride booked successfully. Searching for drivers...",
  "data": {
    "rideId": "ride_xxxxx",
    "status": "REQUESTED",
    "estimatedFare": 25.5,
    "paymentMethod": "CARD",
    "paymentTransactionId": "pi_xxxxx", // Payment Intent ID (payment hold)
    "paymentStatus": "PENDING"
  }
}
```

**Important:**

- For `CARD`, `GOOGLE_PAY`, or `APPLE_PAY` payment methods, payment is **automatically held** during booking
- The `paymentTransactionId` (or `paymentIntentId` in the ride document) indicates the payment hold was created
- Payment is **NOT captured** yet - it's only authorized/held

---

#### Book Ride with Google Pay (Payment Hold)

```http
POST /api/user/rides/book
```

**Body:**

```json
{
  "pickupLocation": {...},
  "dropoffLocation": {...},
  "carType": "STANDARD",
  "paymentMethod": "GOOGLE_PAY",
  "cardId": "pm_xxxxx", // Google Pay payment method ID
  "bookedFor": "ME"
}
```

---

#### Book Ride with Apple Pay (Payment Hold)

```http
POST /api/user/rides/book
```

**Body:**

```json
{
  "pickupLocation": {...},
  "dropoffLocation": {...},
  "carType": "STANDARD",
  "paymentMethod": "APPLE_PAY",
  "cardId": "pm_xxxxx", // Apple Pay payment method ID
  "bookedFor": "ME"
}
```

---

### 4. Ride Completion (Payment Capture)

#### Complete Ride - Driver

```http
PUT /api/user/rides/complete/:rideId
```

**Body:**

```json
{
  "actualDistance": 12.5,
  "waitingTime": 5
}
```

**Description:**

- Driver completes the ride
- **Payment is automatically processed via Socket event `ride:pay_driver`**
- If `paymentIntentId` exists: Payment is **captured** automatically
- If no `paymentIntentId`: New payment is created

**Payment Processing Flow (Automatic):**

1. Ride status updated to `RIDE_COMPLETED`
2. Actual fare calculated
3. Socket event `ride:pay_driver` is triggered automatically
4. Payment hold is captured (if exists) or new payment is created
5. Driver payout is processed
6. Transaction records are created
7. Payment status updated to `COMPLETED`

**No additional API call needed** - Payment processing happens automatically in the background.

---

### 5. Ride Cancellation (Payment Hold Release)

#### Cancel Ride

```http
PUT /api/user/rides/:rideId/cancel
```

**Body:**

```json
{
  "reason": "Changed my mind"
}
```

**Description:**

- Passenger cancels the ride
- **Payment hold is automatically released** via Socket event `ride:passenger_cancel_ride`
- If `paymentIntentId` exists: Payment hold is **cancelled** automatically
- Funds are released back to passenger

**Payment Hold Release (Automatic):**

- Happens automatically when ride is cancelled
- No additional API call needed
- Payment hold cancellation happens in the background

---

## Socket Events

### Payment Processing Events

The following Socket events are used for payment processing:

#### 1. Ride Completion (Triggers Payment)

**Event:** `ride:driver_complete_ride`

**Driver sends:**

```json
{
  "rideId": "ride_xxxxx",
  "actualDistance": 12.5,
  "earlyCompleteReason": null
}
```

**System automatically triggers:** `ride:pay_driver` event

---

#### 2. Payment Processing

**Event:** `ride:pay_driver`

**System automatically sends:**

```json
{
  "rideId": "ride_xxxxx"
}
```

**Processing Logic:**

- Checks if `ride.paymentIntentId` exists
- If exists: Captures held payment → Processes driver payout
- If not exists: Creates new payment → Processes driver payout

**Response:**

```json
{
  "success": true,
  "objectType": "pay-driver",
  "data": {
    "ride": {...},
    "transaction": {...}
  },
  "message": "Driver Paid Successfully"
}
```

---

#### 3. Ride Cancellation (Releases Hold)

**Event:** `ride:passenger_cancel_ride`

**Passenger sends:**

```json
{
  "rideId": "ride_xxxxx",
  "reason": "Changed my mind"
}
```

**Payment Hold Release (Automatic):**

- System checks if `ride.paymentIntentId` exists
- If exists: Cancels payment hold automatically
- Funds are released back to passenger

---

## Payment Flow Diagram

```
1. User Books Ride (CARD/GOOGLE_PAY/APPLE_PAY)
   ↓
2. Payment Hold Created (Authorization)
   ↓
3. Ride Status: REQUESTED → DRIVER_ASSIGNED → RIDE_STARTED
   ↓
4. Driver Completes Ride
   ↓
5. Payment Hold Captured (Automatic via Socket)
   ↓
6. Driver Payout Processed
   ↓
7. Payment Status: COMPLETED
```

---

## Error Handling

### Payment Hold Failure

If payment hold fails during booking:

- Ride booking is rejected
- Error message returned to passenger
- No payment hold created

**Error Response:**

```json
{
  "success": false,
  "message": "Payment authorization failed. Please check your payment method and try again."
}
```

---

### Payment Capture Failure

If payment capture fails during ride completion:

- Error logged
- Error message returned via Socket
- Ride remains in `RIDE_COMPLETED` status
- Payment status remains `PROCESSING`
- Admin notification sent

---

### Payment Hold Cancellation Failure

If payment hold cancellation fails during ride cancellation:

- Error logged
- Ride cancellation still succeeds
- Payment hold may expire automatically (Stripe default: 7 days)

---

## Important Notes

1. **Payment Hold Expiry:** Stripe payment intents expire after 7 days if not captured. Ensure rides complete within this timeframe.

2. **Amount Differences:** If actual fare differs from estimated fare, payment intent is updated before capture.

3. **Socket Events:** Payment processing happens automatically via Socket events. No manual API calls needed after ride completion.

4. **Multiple Payment Methods:** A passenger can have multiple payment methods, but only one Google Pay and one Apple Pay at a time.

5. **Payment Status States:**
   - `PENDING` - Payment hold created (authorized but not captured)
   - `PROCESSING` - Payment is being processed (capture in progress)
   - `COMPLETED` - Payment captured and driver paid
   - `CANCELLED` - Payment hold released/cancelled

---

## Testing

### Test Cards (Stripe Test Mode)

- **Success:** `4242 4242 4242 4242`
- **Declined:** `4000 0000 0000 0002`
- **Insufficient Funds:** `4000 0000 0000 9995`

### Test Payment Intent IDs

Use Stripe Dashboard to test payment intents in test mode.

---

## Frontend Integration Guide

### 1. Setup Google Pay / Apple Pay

```javascript
// Step 1: Get Setup Intent
const response = await fetch(
  '/api/user/passenger/payment-method/wallet/add?walletType=GOOGLE_PAY',
  {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  },
);
const { data } = await response.json();

// Step 2: Use clientSecret with Stripe Elements
const stripe = await loadStripe('YOUR_PUBLISHABLE_KEY');
const elements = stripe.elements({
  clientSecret: data.clientSecret,
});

// Step 3: Show Google Pay / Apple Pay button
const paymentElement = elements.create('payment', {
  paymentMethodTypes: ['card'],
  wallets: {
    applePay: 'auto',
    googlePay: 'auto',
  },
});
paymentElement.mount('#payment-element');

// Step 4: Confirm setup
const { error, setupIntent } = await stripe.confirmSetup({
  elements,
  clientSecret: data.clientSecret,
});
```

---

### 2. Book Ride with Payment Hold

```javascript
const bookRide = async (rideData) => {
  const response = await fetch('/api/user/rides/book', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      pickupLocation: {...},
      dropoffLocation: {...},
      carType: 'STANDARD',
      paymentMethod: 'CARD', // or 'GOOGLE_PAY' or 'APPLE_PAY'
      cardId: 'pm_xxxxx', // Payment method ID
      bookedFor: 'ME'
    })
  });

  const result = await response.json();

  if (result.success) {
    // Payment hold created successfully
    // ride.paymentTransactionId contains payment intent ID
    console.log('Payment hold created:', result.data.paymentTransactionId);
  }
};
```

---

### 3. Monitor Payment Processing (Socket)

```javascript
// Connect to Socket
const socket = io('http://localhost:3000', {
  auth: {
    token: accessToken,
  },
});

// Listen for payment processing
socket.on('ride:pay_driver', (data) => {
  if (data.success) {
    console.log('Payment processed:', data.data.transaction);
    // Update UI - payment completed
  }
});

// Listen for payment errors
socket.on('error', (error) => {
  if (error.objectType === 'pay-driver') {
    console.error('Payment failed:', error.message);
    // Show error to user
  }
});
```

---

## Postman Collection

Import `Payment_Hold_APIs.postman_collection.json` into Postman to test all endpoints.

**Collection Variables:**

- `baseUrl`: API base URL (default: `http://localhost:3000`)
- `accessToken`: JWT access token

---

## Support

For issues or questions, contact the development team or refer to the main documentation.
