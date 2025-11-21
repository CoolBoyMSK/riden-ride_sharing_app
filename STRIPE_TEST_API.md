# Stripe Payment Test API

Simple Stripe payment testing endpoints for development and testing purposes.

## Base URL

```
http://localhost:3000/api/test/stripe
```

## Endpoints

### 1. Create Payment Intent

**POST** `/create-payment-intent`

Create a new payment intent for testing.

**Request Body:**

```json
{
  "amount": 10.0,
  "currency": "usd",
  "description": "Test payment",
  "paymentMethodId": "pm_card_visa" // Optional
}
```

**Response:**

```json
{
  "success": true,
  "message": "Payment intent created successfully",
  "data": {
    "id": "pi_xxx",
    "clientSecret": "pi_xxx_secret_xxx",
    "amount": 10,
    "currency": "usd",
    "status": "requires_payment_method",
    "description": "Test payment"
  }
}
```

---

### 2. Confirm Payment

**POST** `/confirm-payment`

Confirm a payment intent.

**Request Body:**

```json
{
  "paymentIntentId": "pi_xxx",
  "paymentMethodId": "pm_xxx" // Optional
}
```

**Response:**

```json
{
  "success": true,
  "message": "Payment confirmed successfully",
  "data": {
    "id": "pi_xxx",
    "status": "succeeded",
    "amount": 10,
    "currency": "usd"
  }
}
```

---

### 3. Get Payment Status

**GET** `/payment-status/:paymentIntentId`

Get the status of a payment intent.

**Example:**

```
GET /api/test/stripe/payment-status/pi_xxx
```

**Response:**

```json
{
  "success": true,
  "message": "Payment status retrieved successfully",
  "data": {
    "id": "pi_xxx",
    "status": "succeeded",
    "amount": 10,
    "currency": "usd",
    "description": "Test payment",
    "created": "2024-01-01T00:00:00.000Z",
    "metadata": {}
  }
}
```

---

### 4. Cancel Payment

**POST** `/cancel-payment`

Cancel a payment intent.

**Request Body:**

```json
{
  "paymentIntentId": "pi_xxx"
}
```

**Response:**

```json
{
  "success": true,
  "message": "Payment cancelled successfully",
  "data": {
    "id": "pi_xxx",
    "status": "canceled",
    "amount": 10,
    "currency": "usd"
  }
}
```

---

### 5. Create Refund

**POST** `/refund`

Create a refund for a payment intent.

**Request Body:**

```json
{
  "paymentIntentId": "pi_xxx",
  "amount": 10.0, // Optional - if not provided, full refund
  "reason": "requested_by_customer" // Optional
}
```

**Response:**

```json
{
  "success": true,
  "message": "Refund created successfully",
  "data": {
    "id": "re_xxx",
    "amount": 10,
    "currency": "usd",
    "status": "succeeded",
    "reason": "requested_by_customer",
    "paymentIntentId": "pi_xxx"
  }
}
```

---

### 6. Create Payment Method

**POST** `/create-payment-method`

Create a payment method for testing.

**Request Body:**

```json
{
  "type": "card",
  "card": {
    "number": "4242424242424242",
    "exp_month": 12,
    "exp_year": 2025,
    "cvc": "123"
  }
}
```

**Response:**

```json
{
  "success": true,
  "message": "Payment method created successfully",
  "data": {
    "id": "pm_xxx",
    "type": "card",
    "card": {
      "brand": "visa",
      "last4": "4242",
      "exp_month": 12,
      "exp_year": 2025
    }
  }
}
```

---

### 7. Get All Payments

**GET** `/payments?limit=10`

Get all payment intents (for testing).

**Query Parameters:**

- `limit` (optional): Number of payments to retrieve (default: 10)

**Example:**

```
GET /api/test/stripe/payments?limit=20
```

**Response:**

```json
{
  "success": true,
  "message": "Payment intents retrieved successfully",
  "data": [
    {
      "id": "pi_xxx",
      "status": "succeeded",
      "amount": 10,
      "currency": "usd",
      "description": "Test payment",
      "created": "2024-01-01T00:00:00.000Z"
    }
  ],
  "hasMore": false
}
```

---

## Test Card Numbers

Use these Stripe test card numbers:

| Card Number        | Description                    |
| ------------------ | ------------------------------ |
| `4242424242424242` | Visa - Success                 |
| `4000000000000002` | Visa - Declined                |
| `4000002500003155` | Visa - Requires Authentication |
| `5555555555554444` | Mastercard - Success           |
| `5200828282828210` | Mastercard - Declined          |

**Test Card Details:**

- CVV: Any 3 digits (e.g., `123`)
- Expiry: Any future date (e.g., `12/2025`)
- ZIP: Any 5 digits (e.g., `12345`)

---

## Example cURL Commands

### Create Payment Intent

```bash
curl -X POST http://localhost:3000/api/test/stripe/create-payment-intent \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 10.00,
    "currency": "usd",
    "description": "Test payment"
  }'
```

### Confirm Payment

```bash
curl -X POST http://localhost:3000/api/test/stripe/confirm-payment \
  -H "Content-Type: application/json" \
  -d '{
    "paymentIntentId": "pi_xxx",
    "paymentMethodId": "pm_xxx"
  }'
```

### Get Payment Status

```bash
curl -X GET http://localhost:3000/api/test/stripe/payment-status/pi_xxx
```

### Cancel Payment

```bash
curl -X POST http://localhost:3000/api/test/stripe/cancel-payment \
  -H "Content-Type: application/json" \
  -d '{
    "paymentIntentId": "pi_xxx"
  }'
```

### Create Refund

```bash
curl -X POST http://localhost:3000/api/test/stripe/refund \
  -H "Content-Type: application/json" \
  -d '{
    "paymentIntentId": "pi_xxx",
    "amount": 10.00
  }'
```

---

## Payment Intent Statuses

- `requires_payment_method` - Payment intent created, waiting for payment method
- `requires_confirmation` - Payment method attached, needs confirmation
- `requires_action` - Additional authentication required
- `processing` - Payment is being processed
- `succeeded` - Payment completed successfully
- `canceled` - Payment was canceled
- `requires_capture` - Payment authorized, waiting for capture

---

## Notes

- These endpoints are for **testing purposes only**
- Make sure your `STRIPE_SECRET_KEY` is set in environment variables
- Use Stripe test mode keys (starting with `sk_test_`)
- All amounts are in the base currency unit (e.g., $10.00 = 10.00)
- The API automatically converts amounts to cents for Stripe
