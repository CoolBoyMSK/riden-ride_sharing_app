# 🚀 Postman Collections Setup Guide

## 📁 Files Created

1. **`Passenger_Ride_APIs.postman_collection.json`** - Complete passenger ride APIs
2. **`Driver_Ride_APIs.postman_collection.json`** - Complete driver ride APIs  
3. **`Ride_APIs_Environment.postman_environment.json`** - Environment variables
4. **`POSTMAN_SETUP_GUIDE.md`** - This setup guide

---

## 🔧 Quick Setup Instructions

### Step 1: Import Collections
1. Open Postman
2. Click **Import** button
3. Import these 3 files:
   - `Passenger_Ride_APIs.postman_collection.json`
   - `Driver_Ride_APIs.postman_collection.json`
   - `Ride_APIs_Environment.postman_environment.json`

### Step 2: Set Environment
1. Select **"Ride APIs Environment"** from environment dropdown
2. Update these variables:
   - `base_url`: Your server URL (default: `http://localhost:3000/api/user/rides`)
   - `passenger_access_token`: JWT token from passenger login
   - `driver_access_token`: JWT token from driver login

### Step 3: Authenticate Users
Before testing ride APIs, get JWT tokens by:

#### For Passenger:
```bash
POST {{auth_base_url}}/login
{
  "email": "passenger@example.com",
  "password": "password123"
}
```

#### For Driver:
```bash
POST {{auth_base_url}}/login  
{
  "email": "driver@example.com",
  "password": "password123"
}
```

Copy the `accessToken` from responses and paste into environment variables.

---

## 📋 Passenger APIs Collection

### 🎯 **1. Ride Booking Flow**
- **Get Fare Estimate** - Calculate ride cost with promo codes
- **Get Available Car Types** - See available vehicles and wait times
- **Validate Promo Code** - Check promo code validity
- **Book Ride** - Complete ride booking with payment method

### 🚗 **2. Ride Tracking & Management**
- **Get Current Ride** - View active ride status
- **Get Ride Status** - Detailed ride information
- **Get Driver Location** - Real-time driver tracking
- **Cancel Ride** - Cancel active ride with reason

### 💳 **3. Payment & Billing**
- **Get Payment Methods** - Available payment options
- **Get Ride Cost Breakdown** - Detailed fare breakdown
- **Process Payment** - Complete payment after ride

### 📊 **4. History & Analytics**
- **Get Ride History** - Past rides with pagination
- **Get Ride Statistics** - Ride analytics and spending

### 🧪 **5. Sample Test Scenarios**
- **Complete Ride Flow Test** - End-to-end booking
- **Test Invalid Promo Code** - Error handling
- **Test Cash Payment Booking** - Alternative payment

---

## 🚛 Driver APIs Collection

### 📍 **1. Driver Location Management**
- **Update Driver Location** - Real-time GPS updates
- Different scenarios: Online, Moving, Stationary

### 📋 **2. Ride Status Management**
- **Update Status - Driver Arriving** - En route to pickup
- **Update Status - Driver Arrived** - At pickup location
- **Update Status - Ride In Progress** - During trip

### 🎬 **3. Ride Lifecycle Actions**
- **Start Ride** - Begin trip with passenger
- **Complete Ride** - End trip with distance/time data
- Different scenarios: Short, Long, Airport rides

### 📱 **4. Ride Information & Tracking**
- **Get Ride Status** - Driver view of ride details
- **Get Ride Cost Breakdown** - Fare information

### 🎭 **5. Driver Workflow Scenarios**
Complete workflows for:
- **City Ride Workflow** - Typical urban ride
- **Airport Pickup Workflow** - Airport trips with waiting

### 🗺️ **6. Location Update Patterns**
- **Real-time Updates** - Continuous location tracking
- **Highway Driving** - High-speed updates
- **Traffic Jam** - Low-speed/stationary updates

---

## 🔄 Complete Testing Workflow

### Passenger Flow:
```
1. Get Fare Estimate → 2. Validate Promo Code → 3. Book Ride → 
4. Track Ride Status → 5. Get Driver Location → 6. Process Payment
```

### Driver Flow:
```
1. Update Location (Online) → 2. Accept Ride → 3. Update Status (Arriving) → 
4. Update Status (Arrived) → 5. Start Ride → 6. Complete Ride
```

---

## 🎯 Sample API Requests

### Passenger: Book a Ride
```json
POST {{base_url}}/book
{
  "pickupLocation": {
    "coordinates": [-74.006, 40.7128],
    "address": "123 Main St, New York, NY",
    "placeName": "Empire State Building"
  },
  "dropoffLocation": {
    "coordinates": [-73.935, 40.7282], 
    "address": "456 Broadway, New York, NY",
    "placeName": "Times Square"
  },
  "carType": "standard",
  "paymentMethod": "card",
  "promoCode": "SAVE20",
  "specialRequests": "Please call when arrived"
}
```

### Driver: Update Location
```json
PUT {{base_url}}/driver/location
{
  "coordinates": [-74.006, 40.7128],
  "heading": 45,
  "speed": 25,
  "accuracy": 5
}
```

### Driver: Complete Ride
```json
PUT {{base_url}}/{{ride_id}}/complete
{
  "actualDistance": 7.5,
  "waitingTime": 3
}
```

---

## 🔒 Authentication Headers

All requests require authentication:
```
Authorization: Bearer {{passenger_access_token}}
Authorization: Bearer {{driver_access_token}}
```

---

## 🧪 Testing Tips

1. **Environment Variables**: Use `{{variable_name}}` for dynamic values
2. **Auto-save Ride ID**: Booking requests automatically save `ride_id`
3. **Pre-request Scripts**: Collections auto-generate test data
4. **Response Tests**: Built-in tests validate responses
5. **Random Data**: Some requests use Postman's dynamic variables

---

## 🎨 Features Included

### ✅ **Passenger Features:**
- Fare estimation with promo codes
- Multiple car types selection
- Real-time ride tracking
- Payment method management
- Ride history and analytics
- Comprehensive error handling

### ✅ **Driver Features:**
- Real-time location updates
- Ride status management
- Complete ride lifecycle
- Different driving scenarios
- Workflow automation
- Distance and time tracking

### ✅ **Business Features:**
- Promo code validation
- Dynamic fare calculation
- Payment processing simulation
- Real-time tracking
- Complete audit trail
- Analytics and reporting

---

## 🚀 Ready to Test!

Your Postman collections are now ready for comprehensive API testing. Start with authentication, then follow the passenger booking flow and driver workflow scenarios.

**Happy Testing! 🎉**
