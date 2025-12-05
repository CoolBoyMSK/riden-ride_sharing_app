// Universal complaint types that can be used by both drivers and passengers
export const COMPLAIN_TYPES = [
  // Safety Issues
  'safety_issue',
  'unsafe_driving',
  'made_me_feel_unsafe',
  
  // Behavior Issues
  'behavior_issue',
  'passenger_behavior',
  'driver_behavior',
  
  // Vehicle Issues
  'vehicle_condition',
  'vehicle_dirty',
  'vehicle_not_as_listed',
  'vehicle_damaged',
  'vehicle_dirtied',
  
  // Trip/Route Issues
  'trip_route_problem',
  'wrong_route',
  'wrong_pickup',
  'wrong_dropoff',
  'wrong_pickup_dropoff',
  'trip_problem',
  'booking_issue',
  
  // Payment/Fare Issues
  'fare_payment_issue',
  'payment_problem',
  'fare_problem',
  'overcharged',
  'payment_or_fare_problem',
  
  // App/Technical Issues
  'app_technical_issue',
  'app_issue',
  'trip_issue',
  'technical_issue',
  
  // Lost Items
  'lost_item',
  
  // Other
  'other',
];

// Driver-specific complaint types (when driver complains about passenger)
export const DRIVER_COMPLAIN_TYPES = [
  'passenger_behavior',
  'made_me_feel_unsafe',
  'vehicle_damaged',
  'vehicle_dirtied',
  'wrong_pickup_dropoff',
  'payment_or_fare_problem',
  'app_issue',
  'trip_issue',
  'other',
];

// Passenger-specific complaint types (when passenger complains about driver)
export const PASSENGER_COMPLAIN_TYPES = [
  'driver_behavior',
  'unsafe_driving',
  'vehicle_dirty',
  'vehicle_not_as_listed',
  'wrong_route',
  'trip_problem',
  'overcharged',
  'fare_problem',
  'app_issue',
  'booking_issue',
  'lost_item',
  'other',
];

// Helper function to get complaint types based on user role
export const getComplainTypesByRole = (role) => {
  if (role === 'driver') {
    return DRIVER_COMPLAIN_TYPES;
  } else if (role === 'passenger') {
    return PASSENGER_COMPLAIN_TYPES;
  }
  return COMPLAIN_TYPES; // Return all types if role is not specified
};

// Human-readable labels for complaint types (for frontend display)
export const COMPLAIN_TYPE_LABELS = {
  // Safety Issues
  safety_issue: 'Safety Issue',
  unsafe_driving: 'Unsafe Driving',
  made_me_feel_unsafe: 'Made Me Feel Unsafe',
  
  // Behavior Issues
  behavior_issue: 'Behavior Issue',
  passenger_behavior: 'Passenger Behavior',
  driver_behavior: 'Driver Behavior',
  
  // Vehicle Issues
  vehicle_condition: 'Vehicle Condition',
  vehicle_dirty: 'Vehicle Dirty',
  vehicle_not_as_listed: 'Vehicle Not As Listed',
  vehicle_damaged: 'Vehicle Damaged',
  vehicle_dirtied: 'Vehicle Dirtied',
  
  // Trip/Route Issues
  trip_route_problem: 'Trip/Route Problem',
  wrong_route: 'Wrong Route',
  wrong_pickup: 'Wrong Pickup',
  wrong_dropoff: 'Wrong Drop-off',
  wrong_pickup_dropoff: 'Wrong Pickup/Drop-off',
  trip_problem: 'Trip Problem',
  booking_issue: 'Booking Issue',
  
  // Payment/Fare Issues
  fare_payment_issue: 'Fare/Payment Issue',
  payment_problem: 'Payment Problem',
  fare_problem: 'Fare Problem',
  overcharged: 'Overcharged',
  payment_or_fare_problem: 'Payment or Fare Problem',
  
  // App/Technical Issues
  app_technical_issue: 'App/Technical Issue',
  app_issue: 'App Issue',
  trip_issue: 'Trip Issue',
  technical_issue: 'Technical Issue',
  
  // Lost Items
  lost_item: 'Lost Item',
  
  // Other
  other: 'Other',
};

// Helper function to get label for a complaint type
export const getComplainTypeLabel = (type) => {
  return COMPLAIN_TYPE_LABELS[type] || type;
};

// Helper function to get complaint types with labels for a specific role
export const getComplainTypesWithLabels = (role = null) => {
  const types = getComplainTypesByRole(role);
  return types.map((type) => ({
    value: type,
    label: getComplainTypeLabel(type),
  }));
};
