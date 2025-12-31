# Riden - Ride Sharing Backend

A production-grade ride-sharing platform backend built with Node.js, featuring real-time communication, payment processing, and comprehensive ride management.

## 🚀 Features

### Core Ride Management
- **Real-time Ride Booking** - Instant driver matching with live location tracking
- **Scheduled Rides** - Book rides in advance with automated driver assignment
- **Multiple Vehicle Types** - Standard, SUV, Van, Premium, Wheelchair Accessible
- **Dynamic Pricing** - Zone-based fare calculation with surge pricing support
- **Ride Lifecycle** - Complete flow from booking → matching → pickup → trip → completion

### Payment System
- **Stripe Integration** - Full payment processing with Stripe Connect
- **Payment Holds** - Pre-authorize payments before ride completion
- **Driver Payouts** - Automated weekly payouts to driver accounts
- **Multiple Payment Methods** - Cards, Google Pay, Apple Pay support
- **Promo Codes** - Discount system with various promo types

### Real-time Features
- **Socket.IO** - Live driver location updates, ride status changes
- **Redis Adapter** - Scalable real-time communication across instances
- **In-app Chat** - Driver-passenger messaging with chat rooms
- **Voice/Video Calls** - Agora RTC integration for direct communication

### Driver Features
- **Driver Onboarding** - Document verification, vehicle registration
- **Waybill System** - Daily driver shifts with airport queue support
- **Airport Queue** - FIFO queue system for airport pickups
- **Earnings Dashboard** - Track earnings, tips, and payouts
- **Rating System** - Two-way ratings with review management

### Passenger Features
- **Saved Addresses** - Home, work, and custom locations
- **Ride History** - Complete trip history with receipts
- **Favorites** - Save preferred drivers
- **Rating & Tips** - Rate drivers and add tips post-ride

### Admin Panel
- **Dashboard Analytics** - Revenue, rides, user statistics
- **User Management** - Drivers, passengers, admins
- **Zone Management** - Geofenced areas with custom fare rules
- **Commission Settings** - Configurable platform fees
- **Support Tickets** - Customer complaint management

### Notifications
- **Push Notifications** - Firebase Cloud Messaging
- **SMS Alerts** - Twilio integration for OTP and updates
- **Email Notifications** - Transactional emails via SMTP

## 🛠 Tech Stack

| Category | Technology |
|----------|------------|
| **Runtime** | Node.js 18+ |
| **Framework** | Express.js 5.x |
| **Database** | MongoDB with Mongoose ODM |
| **Real-time** | Socket.IO + Redis Adapter |
| **Queue** | BullMQ (Redis-based) |
| **Payments** | Stripe (Connect, Payment Intents) |
| **Auth** | Firebase Admin SDK |
| **SMS** | Twilio |
| **Calls** | Agora RTC |
| **Storage** | AWS S3 |
| **Process Manager** | PM2 |

## 📦 Installation

### Prerequisites
- Node.js 18+
- MongoDB 6+
- Redis 7+
- Stripe Account
- Firebase Project
- Twilio Account (optional)
- AWS S3 Bucket (optional)

### Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/CoolBoyMSK/riden-ride-backend.git
   cd riden-ride-backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Start development server**
   ```bash
   npm run dev
   ```

5. **Start production server**
   ```bash
   npm start
   ```

## ⚙️ Environment Variables

```env
# Server
PORT=5000
NODE_ENV=development

# Database
MONGO_URI=mongodb://localhost:27017/riden

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Firebase
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY=...
FIREBASE_CLIENT_EMAIL=...

# Twilio (optional)
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=...

# AWS S3 (optional)
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_S3_BUCKET=...
AWS_REGION=...
```

## 📁 Project Structure

```
src/
├── config/          # Configuration files (DB, Redis, Firebase, etc.)
├── controllers/     # Route handlers
│   ├── Admin/       # Admin panel endpoints
│   ├── User/        # Driver & passenger endpoints
│   └── Test/        # Testing endpoints
├── dal/             # Data Access Layer (database operations)
├── enums/           # Constants and enumerations
├── middlewares/     # Auth, logging, file upload
├── models/          # Mongoose schemas
├── queues/          # BullMQ job queues
├── realtime/        # Socket.IO event handlers
├── routes/          # Express route definitions
├── services/        # Business logic layer
├── templates/       # Email templates
├── utils/           # Helper functions
├── validations/     # Request validation schemas
└── workers/         # Background job processors
```

## 🔌 API Documentation

API collections are available in the root directory:
- `Passenger_Ride_APIs.postman_collection.json`
- `Driver_Ride_APIs.postman_collection.json`
- `Payment_Hold_APIs.postman_collection.json`

Import these into Postman along with `Ride_APIs_Environment.postman_environment.json`.

## 🚦 Real-time Events

### Client → Server
| Event | Description |
|-------|-------------|
| `update_location` | Driver location update |
| `book_ride` | Request a new ride |
| `accept_ride` | Driver accepts ride request |
| `start_ride` | Begin the trip |
| `complete_ride` | End the trip |
| `cancel_ride` | Cancel booking |
| `send_message` | Chat message |

### Server → Client
| Event | Description |
|-------|-------------|
| `new_ride_request` | Broadcast to nearby drivers |
| `ride_accepted` | Notify passenger of acceptance |
| `driver_location` | Real-time driver position |
| `ride_status_changed` | Status updates |
| `new_message` | Incoming chat message |

## 🏃 Scripts

```bash
npm start          # Start production server
npm run dev        # Start development server with nodemon
npm run pm2:start  # Start with PM2 cluster mode
npm run pm2:stop   # Stop PM2 processes
```

## 📄 License

This project is proprietary software. All rights reserved.

---

Built with ❤️ for the future of transportation
