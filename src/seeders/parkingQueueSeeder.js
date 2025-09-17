import mongoose from 'mongoose';
import ParkingQueue from '../models/ParkingQueue.js';
import { RESTRICTED_AREA } from '../enums/restrictedArea.js';
import env from '../config/envConfig.js';

const DB_URI = env.DB_URI;

export const parkingQueueSeeder = async () => {
  try {
    // 1️⃣ Connect to MongoDB
    await mongoose.connect(DB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB');

    console.log('🌱 Starting parking queue seeding...');

    for (const airport of RESTRICTED_AREA) {
      for (const lot of airport.parkingLots) {
        const { id, coordinates, name } = lot;

        // Use upsert to avoid duplicate key errors
        await ParkingQueue.findOneAndUpdate(
          { parkingLotId: id },
          {
            parkingLotId: id,
            location: {
              type: 'Point',
              coordinates: [coordinates.longitude, coordinates.latitude],
            },
            $setOnInsert: { driverIds: [] },
          },
          { upsert: true, new: true },
        );

        console.log(`✅ Seeded parking lot: ${name} (ID: ${id})`);
      }
    }

    console.log('🎉 Parking queue seeding completed!');
  } catch (err) {
    console.error('❌ Error while seeding parking queues:', err.message);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
};

// Allow running directly via CLI
if (process.argv[1].includes('parkingQueueSeeder.js')) {
  parkingQueueSeeder();
}
