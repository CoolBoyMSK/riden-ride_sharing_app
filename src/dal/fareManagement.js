import fareManagement from '../models/fareManagement.js';

export async function createFareManagement(carType, dailyFares) {
  const doc = new fareManagement({ carType, dailyFares });
  return await doc.save();
}

export async function getFareByCarType(carType) {
  return await FareManagement.findOne({ carType }).lean();
}

export async function getAllFareManagements() {
  return await FareManagement.find().lean();
}

export async function updateFareManagement(carType, newDailyFares) {
  return await FareManagement.findOneAndUpdate(
    { carType },
    { dailyFares: newDailyFares },
    { new: true, runValidators: true },
  ).lean();
}

export async function updateDailyFare(carType, day, partialDailyFare) {
  const update = {};
  for (const [key, value] of Object.entries(partialDailyFare)) {
    update[`dailyFares.$.${key}`] = value;
  }

  return await FareManagement.findOneAndUpdate(
    { carType, 'dailyFares.day': day },
    { $set: update },
    { new: true, runValidators: true },
  ).lean();
}

export async function deleteFareManagement(carType) {
  return await FareManagement.deleteOne({ carType });
}
