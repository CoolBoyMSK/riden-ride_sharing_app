export const generatePromoCodeString = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

export const validateDates = (startsAt, endsAt) => {
  if (endsAt <= startsAt) {
    throw new Error('End date must be after start date');
  }
};
