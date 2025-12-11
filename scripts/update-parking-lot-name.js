import mongoose from 'mongoose';
import connectDB from '../src/config/db.js';
import Zone from '../src/models/Zone.js';

const updateParkingLotName = async () => {
  try {
    await connectDB();
    console.log('✅ Connected to database\n');

    const parkingLotId = '6914299ca3ab632220e579e7';
    const newName = 'VANCOUVER INTERNATIONAL AIRPORT Parking';

    console.log(`🔍 Finding parking lot ${parkingLotId}...`);
    const parkingLot = await Zone.findById(parkingLotId);

    if (!parkingLot) {
      console.log(`❌ Parking lot not found!`);
      process.exit(1);
    }

    console.log(`✅ Found parking lot:`);
    console.log(`   Current Name: ${parkingLot.name}`);
    console.log(`   Type: ${parkingLot.type}`);
    console.log(`   ID: ${parkingLot._id}`);

    console.log(`\n🔄 Updating name to: "${newName}"...`);
    
    parkingLot.name = newName;
    await parkingLot.save();

    console.log(`✅ Successfully updated parking lot name!`);
    console.log(`   New Name: ${parkingLot.name}`);
    console.log(`\n🎉 Parking lot is now named: "${newName}"`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error updating parking lot name:', error);
    process.exit(1);
  }
};

updateParkingLotName();

