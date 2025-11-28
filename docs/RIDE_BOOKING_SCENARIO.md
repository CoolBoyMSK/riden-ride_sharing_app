# Ride Booking Scenario Documentation

This document describes the complete ride booking flow, including regular rides and scheduled rides.

## Table of Contents

1. [Overview](#overview)
2. [Ride Types](#ride-types)
3. [Booking Flow](#booking-flow)
4. [Payment Processing](#payment-processing)
5. [Scheduled Rides](#scheduled-rides)
6. [Driver Search](#driver-search)
7. [Error Handling](#error-handling)
8. [API Endpoints](#api-endpoints)

---

## Overview

The ride booking system handles two main types of rides:
- **Regular Rides**: Immediate rides that start driver search immediately
- **Scheduled Rides**: Future rides that are queued and activated at a specific time

Both ride types go through similar validation and payment processing, but scheduled rides have additional queue management.

---

## Ride Types

### Regular Rides
- Status: `REQUESTED`
- Driver search starts immediately after booking
- Payment is held/authorized immediately
- No scheduled time

### Scheduled Rides
- Status: `SCHEDULED` (initially), then `REQUESTED` (when activated)
- Driver search starts at scheduled time
- Payment is held/authorized at booking time
- Requires `scheduledTime` field
- Minimum 2 minutes in the future
- Added to BullMQ queue for processing

---

## Booking Flow

### 1. Input Validation

```javascript
validateRideInput(rideData)
```

**Required Fields:**
- `pickupLocation` (with coordinates)
- `dropoffLocation` (with coordinates)
- `carType` (must be valid CAR_TYPE)
- `paymentMethod` (CARD, GOOGLE_PAY, APPLE_PAY, WALLET, CASH)

**Validations:**
- Car type must be in allowed list
- Passengers allowed must be > 0
- Patients allowed must be >= 0

### 2. Passenger Validation

- Check if passenger profile exists
- Check for active rides (cannot book if already on a ride)
- Check for scheduled rides within 45 minutes

### 3. Special Booking Cases

**Booking for Someone Else (`bookedFor === 'SOMEONE'`):**
- Requires `bookedForName` (min 3 characters)
- Requires `bookedForPhoneNumber` (7-20 characters, digits/+/spaces only)
- Admin notification is sent

### 4. Distance & Duration Calculation

**Distance Calculation:**
1. Primary: OSRM API (`router.project-osrm.org`)
2. Fallback: Haversine formula with multiplier
   - Long distances (>20km): 1.2x multiplier
   - Short distances (<5km): 1.4x multiplier
   - Default: 1.3x multiplier

**Duration Estimation:**
- Average speed: 30 km/h
- Formula: `(distance / 30) * 60` minutes

### 5. Surge Pricing Analysis

```javascript
analyzeSurgePricing(pickupLocation.coordinates, carType)
```

**Surge Logic:**
- Analyzes current demand in the area
- Applies surge multiplier if needed
- Updates existing rides if surge is activated/increased
- Returns:
  - `surgeMultiplier`: Applied multiplier (1.0 = no surge)
  - `isSurgeApplied`: Boolean flag
  - `surgeLevel`: Current surge level
  - `shouldUpdateExistingRides`: Whether to update other rides

### 6. Fare Calculation

```javascript
calculateEstimatedFare(carType, distance, duration, promoCode, surgeMultiplier, fareConfig, scheduledTime?)
```

**Fare Components:**
- Base fare
- Distance-based fare
- Time-based fare
- Airport fees (if applicable)
- Surge multiplier
- Promo code discounts (if applicable)
- Scheduled ride adjustments (if applicable)

**Returns:**
- `estimatedFare`: Total fare amount
- `fareBreakdown`: Detailed breakdown
- `promoDetails`: Promo code information (if applied)

### 7. Payment Method Validation

**Card Payments (CARD, GOOGLE_PAY, APPLE_PAY):**
- Requires `paymentMethodId`
- Requires `cardType` for CARD payments

**Wallet Payments:**
- Validates wallet exists
- Checks available balance (handled during payment)

**Cash Payments:**
- No validation needed

### 8. Payment Authorization

```javascript
holdRidePayment(passenger, estimatedAmount, paymentMethodId, paymentMethod, cardType)
```

**Process:**
1. Creates Stripe Payment Intent
2. Authorizes/holds the estimated fare amount
3. Returns `paymentIntentId` for later capture/refund

**Payment Methods Supported:**
- CARD
- GOOGLE_PAY
- APPLE_PAY
- WALLET (handled differently)

### 9. Ride Record Creation

```javascript
createRideRecord(params)
```

**Ride Data Stored:**
- Passenger ID
- Pickup/Dropoff locations
- Car type
- Payment information
- Distance & duration estimates
- Fare breakdown
- Surge information
- Scheduled time (if scheduled ride)
- Booking details (bookedFor, bookedForName, etc.)
- Status: `REQUESTED` or `SCHEDULED`

### 10. Post-Creation Processing

**For Scheduled Rides:**
1. Send notification to passenger
2. Send admin notification
3. Add to scheduled ride queue (3 jobs):
   - Notification job (5 min before scheduled time)
   - Activation job (at scheduled time)
   - Cancellation job (5 min after scheduled time)

**For Regular Rides:**
1. Start progressive driver search
2. Update existing rides surge pricing (if needed)

---

## Payment Processing

### Payment Hold Flow

1. **Authorization**: Payment is authorized/held at booking time
2. **Capture**: Payment is captured when ride is completed
3. **Refund**: Payment hold is cancelled if ride is cancelled

### Payment Intent Lifecycle

```
CREATED → AUTHORIZED → CAPTURED (on completion)
         ↓
      CANCELLED (on cancellation)
```

### Payment Methods

| Method | Authorization | Capture | Refund |
|--------|--------------|---------|--------|
| CARD | Payment Intent | Capture Intent | Cancel Intent |
| GOOGLE_PAY | Payment Intent | Capture Intent | Cancel Intent |
| APPLE_PAY | Payment Intent | Capture Intent | Cancel Intent |
| WALLET | Wallet Balance Check | Wallet Deduction | Wallet Refund |
| CASH | N/A | Cash Collection | N/A |

---

## Scheduled Rides

### Queue Jobs

When a scheduled ride is created, three jobs are added to the `scheduled-ride-queue`:

#### 1. Notification Job
- **Trigger**: 5 minutes before scheduled time
- **Action**: Sends reminder notification to passenger and driver (if assigned)
- **Job ID**: `scheduled-ride-notification-{rideId}`

#### 2. Activation Job
- **Trigger**: At scheduled time
- **Action**: 
  - Changes status from `SCHEDULED` to `REQUESTED`
  - Starts progressive driver search
  - Sends activation notification to passenger
- **Job ID**: `scheduled-ride-activate-{rideId}`

#### 3. Cancellation Job
- **Trigger**: 5 minutes after scheduled time
- **Action**: 
  - Checks if ride is still active
  - Cancels ride if no response from driver/passenger
  - Processes refund based on scenario:
    - **Passenger on another ride**: Partial refund (90% refund, 10% fee)
    - **Driver not ready**: Full refund
    - **Passenger not ready**: Partial refund (90% refund, 10% fee)
    - **Both not ready**: Full refund
- **Job ID**: `scheduled-ride-cancel-{rideId}`

### Scheduled Ride Status Flow

```
SCHEDULED → DRIVER_ASSIGNED (if admin assigns) → REQUESTED → DRIVER_ASSIGNED → ... → RIDE_COMPLETED
                ↓
         CANCELLED_BY_SYSTEM (if no response)
```

### Scheduled Ride Validation

- Scheduled time must be in the future
- Minimum 2 minutes from current time
- Cannot have another scheduled ride within 45 minutes

---

## Driver Search

### Progressive Driver Search

For regular rides, driver search starts immediately:

```javascript
startProgressiveDriverSearch(ride)
```

**Search Process:**
1. Phase 1: Search within 5km radius
2. Phase 2: Expand to 10km radius (if no drivers found)
3. Phase 3: Expand to 15km radius (if still no drivers found)
4. Notify available drivers
5. Wait for driver acceptance

**For Scheduled Rides:**
- Driver search starts when activation job runs
- Same progressive search process applies

---

## Error Handling

### Payment Errors

If payment authorization fails:
- Ride is not created
- Error message returned to user
- No cleanup needed

### Ride Creation Errors

If ride creation fails after payment authorization:
1. Payment hold is cancelled
2. Ride record is deleted (if created)
3. Driver search is stopped (if started)
4. Error logged

### Queue Errors

If scheduled ride queue addition fails:
- Ride is still created
- Error is logged
- Admin can manually trigger queue jobs if needed

### Validation Errors

All validation errors return immediately with:
- `success: false`
- `message`: Error description
- No side effects

---

## API Endpoints

### Get Fare Estimate

```
GET /api/rides/fare-estimate
```

**Query Parameters:**
- `pickupLocation`: JSON string with coordinates
- `dropoffLocation`: JSON string with coordinates
- `carType`: Car type enum
- `promoCode`: Optional promo code

**Response:**
```json
{
  "success": true,
  "estimate": {
    "distance": 5.2,
    "estimatedDuration": 10,
    "fareBreakdown": {...},
    "estimatedFare": 25.50,
    "promoDetails": {...},
    "currency": "CAD",
    "passengersAllowed": 4,
    "patientsAllowed": 1
  }
}
```

### Book Ride

```
POST /api/rides/book
```

**Request Body:**
```json
{
  "pickupLocation": {
    "address": "123 Main St",
    "coordinates": [-79.3832, 43.6532]
  },
  "dropoffLocation": {
    "address": "456 Oak Ave",
    "coordinates": [-79.4000, 43.6600]
  },
  "carType": "STANDARD",
  "paymentMethod": "CARD",
  "paymentMethodId": "pm_xxx",
  "cardType": "VISA",
  "scheduledTime": "2024-12-25T14:30:00Z", // Optional
  "bookedFor": "MYSELF", // or "SOMEONE"
  "bookedForName": "John Doe", // Required if bookedFor === "SOMEONE"
  "bookedForPhoneNumber": "+1234567890", // Required if bookedFor === "SOMEONE"
  "promoCode": "SAVE10", // Optional
  "specialRequests": "Wheelchair accessible" // Optional
}
```

**Response (Regular Ride):**
```json
{
  "success": true,
  "message": "Ride booked successfully. Searching for drivers...",
  "ride": {...},
  "metadata": {
    "processingTime": "250ms",
    "surgeApplied": false,
    "surgeLevel": 0,
    "searchRadius": "5km"
  }
}
```

**Response (Scheduled Ride):**
```json
{
  "success": true,
  "message": "Scheduling request sent successfully",
  "ride": {...}
}
```

### Get Available Car Types

```
GET /api/rides/car-types
```

**Response:**
```json
{
  "success": true,
  "carTypes": ["STANDARD", "PREMIUM", "LUXURY", "XL", "WHEELCHAIR"]
}
```

---

## Status Codes

### Ride Statuses

| Status | Description |
|--------|-------------|
| `REQUESTED` | Ride is requested, searching for drivers |
| `SCHEDULED` | Ride is scheduled for future time |
| `DRIVER_ASSIGNED` | Driver has been assigned to the ride |
| `DRIVER_ARRIVING` | Driver is on the way to pickup |
| `DRIVER_ARRIVED` | Driver has arrived at pickup location |
| `RIDE_STARTED` | Ride has started |
| `RIDE_IN_PROGRESS` | Ride is in progress |
| `RIDE_COMPLETED` | Ride has been completed |
| `CANCELLED_BY_PASSENGER` | Cancelled by passenger |
| `CANCELLED_BY_DRIVER` | Cancelled by driver |
| `CANCELLED_BY_SYSTEM` | Cancelled by system (e.g., no response) |

---

## Queue Management

### Starting the Scheduled Ride Worker

```bash
npm run scheduled-worker
```

### Queue Monitoring

The worker logs:
- Job processing start/completion
- Ride status changes
- Notification sending
- Error handling

### Queue Jobs Status

Jobs can be in these states:
- **Waiting**: Jobs waiting to be processed
- **Delayed**: Jobs scheduled for future execution
- **Active**: Jobs currently being processed
- **Completed**: Successfully completed jobs
- **Failed**: Jobs that failed (with retry logic)

---

## Notification Flow

### Regular Rides

1. **Booking Confirmation**: Sent to passenger immediately
2. **Driver Found**: Sent to passenger when driver accepts
3. **Driver Arriving**: Sent when driver starts heading to pickup
4. **Driver Arrived**: Sent when driver arrives at pickup
5. **Ride Started**: Sent when ride begins
6. **Ride Completed**: Sent when ride ends

### Scheduled Rides

1. **Booking Confirmation**: Sent immediately after booking
2. **Reminder Notification**: Sent 5 minutes before scheduled time
3. **Activation Notification**: Sent when ride is activated
4. **Driver Found**: Same as regular rides
5. **Ride Updates**: Same as regular rides

---

## Best Practices

### For Developers

1. **Always validate input** before processing
2. **Handle errors gracefully** with proper cleanup
3. **Log important events** for debugging
4. **Use transactions** for critical operations
5. **Monitor queue health** regularly

### For Testing

1. Test with various car types
2. Test surge pricing scenarios
3. Test scheduled rides with different time ranges
4. Test payment failures and retries
5. Test cancellation scenarios

---

## Troubleshooting

### Scheduled Rides Not Activating

1. Check if worker is running: `npm run scheduled-worker`
2. Check Redis connection
3. Verify queue jobs were added (check logs)
4. Check ride status in database
5. Verify scheduled time is in the future

### Payment Issues

1. Check Stripe API keys
2. Verify payment method is valid
3. Check payment intent status
4. Review payment logs

### Driver Search Not Starting

1. Verify ride status is `REQUESTED`
2. Check driver availability in area
3. Review driver search logs
4. Verify surge pricing didn't block search

---

## Related Files

- `src/services/User/ride/rideBookingService.js` - Main booking service
- `src/dal/ride.js` - Ride data access layer
- `src/dal/driver.js` - Driver search logic
- `src/dal/stripe.js` - Payment processing
- `src/scheduled/workers/scheduled-ride-processor.js` - Scheduled ride worker
- `src/scheduled/queues/index.js` - Queue configuration

---

## Version History

- **v1.0** - Initial documentation
  - Regular ride booking
  - Scheduled ride booking
  - Payment processing
  - Queue management

---

## Support

For issues or questions:
1. Check logs for error messages
2. Review this documentation
3. Contact development team

