export const CAR_TYPES = [
  'standard',
  'suv',
  'van',
  'premium',
  'wheelchair_accessible',
];

export const PASSENGER_ALLOWED = {
  standard: {
    passengersAllowed: 4,
    patientsAllowed: 0,
  },
  suv: {
    passengersAllowed: 4,
    patientsAllowed: 0,
  },
  van: {
    passengersAllowed: 6,
    patientsAllowed: 0,
  },
  premium: {
    passengersAllowed: 3,
    patientsAllowed: 0,
  },
  wheelchair_accessible: {
    passengersAllowed: 2,
    patientsAllowed: 1,
  },
};
