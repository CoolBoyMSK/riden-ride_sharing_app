# Payment Method Backend Implementation Guide

## What Frontend Sends

### Scenario 1: Using Stripe.js (Recommended - Production)

Frontend creates payment method using Stripe.js and sends only the `paymentMethodId`:

```json
{
  "type": "card",
  "paymentMethodId": "pm_1ABC123xyz789",
  "cardType": "PERSONAL"
}
```

### Scenario 2: Raw Card Data (Testing Only)

Frontend sends raw card details directly (requires enabling raw card data APIs in Stripe Dashboard):

```json
{
  "type": "card",
  "card": {
    "number": "4242424242424242",
    "exp_month": 12,
    "exp_year": 2026,
    "cvc": "123"
  },
  "billing_details": {
    "name": "John Doe",
    "email": "john@example.com"
  },
  "cardType": "PERSONAL"
}
```

---

## Complete Backend Code

### 1. DAL Layer (`src/dal/stripe.js`)

```javascript
export const addPassengerCard = async (passenger, paymentMethodData) => {
  // Validate card type
  const cardType = paymentMethodData.cardType.trim().toUpperCase();
  if (!CARD_TYPES.includes(cardType)) {
    throw new Error('Invalid card type');
  }

  let paymentMethodId;
  let paymentMethod;

  // SCENARIO 1: Payment Method ID provided (from Stripe.js)
  if (paymentMethodData.paymentMethodId) {
    // Payment method already created on frontend via Stripe.js
    paymentMethod = await stripe.paymentMethods.retrieve(
      paymentMethodData.paymentMethodId,
    );

    // Update metadata with passenger info
    paymentMethod = await stripe.paymentMethods.update(
      paymentMethodData.paymentMethodId,
      {
        metadata: {
          ...paymentMethod.metadata,
          passengerId: passenger._id.toString(),
          userId: passenger.userId.toString(),
          userType: 'passenger',
          cardType,
        },
      },
    );

    paymentMethodId = paymentMethod.id;
  }
  // SCENARIO 2: Raw card data provided (testing only)
  else if (paymentMethodData.card) {
    try {
      // Create payment method from raw card data
      paymentMethod = await stripe.paymentMethods.create({
        type: 'card',
        card: {
          number: paymentMethodData.card.number,
          exp_month: paymentMethodData.card.exp_month,
          exp_year: paymentMethodData.card.exp_year,
          cvc: paymentMethodData.card.cvc,
        },
        billing_details: paymentMethodData.billing_details || {},
        metadata: {
          passengerId: passenger._id.toString(),
          userId: passenger.userId.toString(),
          userType: 'passenger',
          cardType,
        },
      });
      paymentMethodId = paymentMethod.id;
    } catch (error) {
      // Handle Stripe's raw card data error
      if (
        error.message.includes('raw card data') ||
        error.message.includes('test tokens') ||
        error.message.includes('Sending credit card numbers directly')
      ) {
        throw new Error(
          'Raw card data is not allowed. Please use Stripe.js on the frontend to create a payment method, or enable raw card data APIs in your Stripe Dashboard for testing. See: https://stripe.com/docs/testing',
        );
      }
      throw error;
    }
  } else {
    throw new Error('Either paymentMethodId or card details must be provided');
  }

  // Attach the payment method to the customer
  await stripe.paymentMethods.attach(paymentMethodId, {
    customer: passenger.stripeCustomerId,
  });

  // Set as default if no default card exists
  const card = await getDefaultCard(passenger.stripeCustomerId);
  if (!card.defaultCardId) {
    await stripe.customers.update(passenger.stripeCustomerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });
    await setDefaultCard(passenger.stripeCustomerId, paymentMethodId);
  }

  // Save to database
  await PassengerModel.findByIdAndUpdate(
    passenger._id,
    {
      $push: { paymentMethodIds: paymentMethodId },
      $push: {
        paymentMethods: {
          id: paymentMethodId,
          type: cardType,
          details: paymentMethod,
        },
      },
    },
    { new: true },
  );

  return paymentMethodId;
};
```

### 2. Service Layer (`src/services/User/passenger/paymentManagement.js`)

```javascript
export const addCard = async (
  user,
  { type, card, billing_details, cardType, paymentMethodId },
  resp,
) => {
  try {
    // Find passenger
    const passenger = await findPassengerByUserId(user._id);
    if (!passenger) {
      resp.error = true;
      resp.error_message = 'Failed to Fetch passenger';
      return resp;
    }

    // Ensure passenger has Stripe customer ID
    if (!passenger.stripeCustomerId) {
      await createPassengerStripeCustomer(user, passenger);
    }

    // Validate that either paymentMethodId or card details are provided
    if (!paymentMethodId && !card) {
      resp.error = true;
      resp.error_message =
        'Either paymentMethodId (from Stripe.js) or card details must be provided';
      return resp;
    }

    // Prepare payload
    const payload = {
      type,
      card,
      billing_details,
      cardType,
      paymentMethodId, // Payment method ID from Stripe.js (if provided)
    };

    // Add card to Stripe and database
    const paymentMethodIdResult = await addPassengerCard(passenger, payload);

    resp.data = {
      success: true,
      paymentMethodId: paymentMethodIdResult,
      message: 'Card added successfully',
    };
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'something went wrong';
    return resp;
  }
};
```

### 3. Validation Schema (`src/schemas/User/Passenger/paymentManagementSchema.js`)

```javascript
export const addPaymentMethodSchema = Joi.object({
  type: Joi.string()
    .valid('card', 'google_pay', 'apple_pay')
    .default('card')
    .required(),

  // For card type: either paymentMethodId OR card details required
  paymentMethodId: Joi.when('type', {
    is: 'card',
    then: Joi.string()
      .pattern(/^pm_[a-zA-Z0-9]+$/)
      .optional()
      .messages({
        'string.pattern.base': 'Invalid Stripe Payment Method ID format',
      }),
    otherwise: Joi.forbidden(),
  }),

  // Card details (required if paymentMethodId not provided)
  card: Joi.when('type', {
    is: 'card',
    then: Joi.when('paymentMethodId', {
      is: Joi.exist(),
      then: Joi.forbidden(), // Don't allow both
      otherwise: Joi.object({
        number: Joi.string().creditCard().required(),
        exp_month: Joi.number().integer().min(1).max(12).required(),
        exp_year: Joi.number()
          .integer()
          .min(new Date().getFullYear())
          .max(new Date().getFullYear() + 15)
          .required(),
        cvc: Joi.string()
          .pattern(/^\d{3,4}$/)
          .required(),
      }).required(),
    }),
    otherwise: Joi.forbidden(),
  }),

  // Billing details (required if using raw card data)
  billing_details: Joi.when('type', {
    is: 'card',
    then: Joi.when('paymentMethodId', {
      is: Joi.exist(),
      then: Joi.object({
        name: Joi.string().min(2).max(100).optional(),
        email: Joi.string().email().optional(),
      }).optional(),
      otherwise: Joi.object({
        name: Joi.string().min(2).max(100).required(),
        email: Joi.string().email().required(),
      }).required(),
    }),
    otherwise: Joi.forbidden(),
  }),

  // Card type (required for card type)
  cardType: Joi.when('type', {
    is: 'card',
    then: Joi.string().valid('PERSONAL', 'BUSINESS').required().messages({
      'any.only': "Card type must be 'PERSONAL' or 'BUSINESS'",
    }),
    otherwise: Joi.forbidden(),
  }),
});
```

### 4. Controller (`src/controllers/User/Passengers/paymentManagementController.js`)

```javascript
export const addCardController = (req, res) =>
  handleResponse(
    {
      handler: addCard,
      validationFn: () => validatePaymentMethod(req.body),
      handlerParams: [req.user, req.body],
      successMessage: 'Card Added successfully',
    },
    req,
    res,
  );
```

---

## Request/Response Examples

### Request 1: Using Stripe.js Payment Method ID

```http
POST /api/passenger/payment-methods/add
Content-Type: application/json
Authorization: Bearer <token>

{
  "type": "card",
  "paymentMethodId": "pm_1ABC123xyz789",
  "cardType": "PERSONAL"
}
```

**Response:**

```json
{
  "success": true,
  "message": "Card Added successfully",
  "data": {
    "success": true,
    "paymentMethodId": "pm_1ABC123xyz789",
    "message": "Card added successfully"
  }
}
```

### Request 2: Using Raw Card Data (Testing)

```http
POST /api/passenger/payment-methods/add
Content-Type: application/json
Authorization: Bearer <token>

{
  "type": "card",
  "card": {
    "number": "4242424242424242",
    "exp_month": 12,
    "exp_year": 2026,
    "cvc": "123"
  },
  "billing_details": {
    "name": "John Doe",
    "email": "john@example.com"
  },
  "cardType": "PERSONAL"
}
```

**Response (Success):**

```json
{
  "success": true,
  "message": "Card Added successfully",
  "data": {
    "success": true,
    "paymentMethodId": "pm_1XYZ789abc123",
    "message": "Card added successfully"
  }
}
```

**Response (Error - Raw Card Data Not Enabled):**

```json
{
  "success": false,
  "error": true,
  "error_message": "Raw card data is not allowed. Please use Stripe.js on the frontend to create a payment method, or enable raw card data APIs in your Stripe Dashboard for testing. See: https://stripe.com/docs/testing"
}
```

---

## Frontend Integration Example (Stripe.js)

```javascript
// Frontend code using Stripe.js
import { loadStripe } from '@stripe/stripe-js';

const stripe = await loadStripe('pk_test_...');

// Create payment method
const { paymentMethod, error } = await stripe.createPaymentMethod({
  type: 'card',
  card: cardElement, // Stripe Elements card element
  billing_details: {
    name: 'John Doe',
    email: 'john@example.com',
  },
});

if (error) {
  console.error('Error creating payment method:', error);
} else {
  // Send paymentMethod.id to your backend
  const response = await fetch('/api/passenger/payment-methods/add', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      type: 'card',
      paymentMethodId: paymentMethod.id,
      cardType: 'PERSONAL',
    }),
  });

  const result = await response.json();
  console.log('Card added:', result);
}
```

---

## Notes

1. **Production**: Always use Stripe.js on the frontend to create payment methods securely
2. **Testing**: Enable "Raw card data APIs" in Stripe Dashboard if you need to test with raw card data
3. **Security**: Never store raw card data in your database
4. **Validation**: The schema ensures either `paymentMethodId` or `card` details are provided, but not both
