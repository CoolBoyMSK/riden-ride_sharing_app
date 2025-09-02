// Ride status flow
export const RIDE_STATUS = [
  'REQUESTED',
  'DRIVER_ASSIGNED',
  'DRIVER_ARRIVING',
  'DRIVER_ARRIVED',
  'RIDE_STARTED',
  'RIDE_IN_PROGRESS',
  'RIDE_COMPLETED',
  'CANCELLED_BY_PASSENGER',
  'CANCELLED_BY_DRIVER',
  'CANCELLED_BY_SYSTEM'
];

// Payment status
export const PAYMENT_STATUS = [
  'PENDING',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'REFUNDED',
  'CANCELLED'
];

// Driver status
export const DRIVER_STATUS = [
  'OFFLINE',
  'ONLINE',
  'BUSY',
  'BREAK'
];



