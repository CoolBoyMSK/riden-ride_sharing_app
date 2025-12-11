import mongoose from 'mongoose';
import connectDB from '../src/config/db.js';
import Zone from '../src/models/Zone.js';
import ParkingQueue from '../src/models/ParkingQueue.js';
import Fare from '../src/models/fareManagement.js';

// Configuration
const AIRPORT_NAME = 'VANCOUVER INTERNATIONAL AIRPORT';
const PARKING_QUEUE_ID = '6914299ca3ab632220e579ea'; // From your logs

const fixParkingQueueAirport = async () => {
  try {
    // Connect to database
    await connectDB();
    console.log('✅ Connected to database\n');

    // Step 1: Find VANCOUVER INTERNATIONAL AIRPORT
    console.log(`🔍 Step 1: Searching for airport "${AIRPORT_NAME}"...`);
    
    const airport = await Zone.findOne({
      name: { $regex: new RegExp(AIRPORT_NAME, 'i') },
      type: 'airport',
      isActive: true,
    }).lean();

    if (!airport) {
      console.log('❌ Airport not found! Searching in FareManagement...');
      
      // Try to find in FareManagement
      const fareZone = await Fare.findOne({
        'zone.name': { $regex: new RegExp(AIRPORT_NAME, 'i') },
        'zone.isActive': true,
        $or: [
          { 'zone.name': { $regex: /airport/i } },
        ],
      }).lean();

      if (!fareZone || !fareZone.zone) {
        console.log('❌ Airport not found in Zone or FareManagement collections');
        console.log('\n💡 Available airports in database:');
        const allAirports = await Zone.find({ type: 'airport', isActive: true }).lean();
        allAirports.forEach((apt) => {
          console.log(`   - ${apt.name} (ID: ${apt._id})`);
        });
        process.exit(1);
      }

      console.log(`✅ Found airport in FareManagement: ${fareZone.zone.name}`);
      console.log(`   Airport ID: ${fareZone.zone._id || fareZone._id}`);
      
      // Use the airport ID from fare zone
      const airportId = fareZone.zone._id || fareZone._id;
      
      // Step 2: Find and update parking queue
      console.log(`\n🔍 Step 2: Finding parking queue ${PARKING_QUEUE_ID}...`);
      const parkingQueue = await ParkingQueue.findById(PARKING_QUEUE_ID)
        .populate('airportId')
        .populate('parkingLotId')
        .lean();

      if (!parkingQueue) {
        console.log(`❌ Parking queue ${PARKING_QUEUE_ID} not found!`);
        process.exit(1);
      }

      console.log(`✅ Found parking queue:`);
      console.log(`   Queue ID: ${parkingQueue._id}`);
      console.log(`   Current Airport: ${parkingQueue.airportId?.name || 'N/A'} (ID: ${parkingQueue.airportId?._id || parkingQueue.airportId})`);
      console.log(`   Parking Lot: ${parkingQueue.parkingLotId?.name || 'N/A'}`);

      // Step 3: Update parking queue
      console.log(`\n🔄 Step 3: Updating parking queue to link with "${fareZone.zone.name}"...`);
      
      const updatedQueue = await ParkingQueue.findByIdAndUpdate(
        PARKING_QUEUE_ID,
        { airportId: airportId },
        { new: true }
      )
        .populate('airportId')
        .populate('parkingLotId')
        .lean();

      console.log(`✅ Successfully updated parking queue!`);
      console.log(`   Queue ID: ${updatedQueue._id}`);
      console.log(`   New Airport: ${updatedQueue.airportId?.name || 'N/A'} (ID: ${updatedQueue.airportId?._id || updatedQueue.airportId})`);
      console.log(`   Parking Lot: ${updatedQueue.parkingLotId?.name || 'N/A'}`);
      console.log(`\n🎉 Parking queue is now linked to ${fareZone.zone.name}!`);
      
      process.exit(0);
    }

    console.log(`✅ Found airport: ${airport.name}`);
    console.log(`   Airport ID: ${airport._id}`);

    // Step 2: Find and update parking queue
    console.log(`\n🔍 Step 2: Finding parking queue ${PARKING_QUEUE_ID}...`);
    const parkingQueue = await ParkingQueue.findById(PARKING_QUEUE_ID)
      .populate('airportId')
      .populate('parkingLotId')
      .lean();

    if (!parkingQueue) {
      console.log(`❌ Parking queue ${PARKING_QUEUE_ID} not found!`);
      process.exit(1);
    }

    console.log(`✅ Found parking queue:`);
    console.log(`   Queue ID: ${parkingQueue._id}`);
    console.log(`   Current Airport: ${parkingQueue.airportId?.name || 'N/A'} (ID: ${parkingQueue.airportId?._id || parkingQueue.airportId})`);
    console.log(`   Parking Lot: ${parkingQueue.parkingLotId?.name || 'N/A'}`);

    // Check if already linked to correct airport
    const currentAirportId = parkingQueue.airportId?._id?.toString() || parkingQueue.airportId?.toString();
    if (currentAirportId === airport._id.toString()) {
      console.log(`\n✅ Parking queue is already linked to ${airport.name}!`);
      console.log(`   No changes needed.`);
      process.exit(0);
    }

    // Step 3: Update parking queue
    console.log(`\n🔄 Step 3: Updating parking queue to link with "${airport.name}"...`);
    
    const updatedQueue = await ParkingQueue.findByIdAndUpdate(
      PARKING_QUEUE_ID,
      { airportId: airport._id },
      { new: true }
    )
      .populate('airportId')
      .populate('parkingLotId')
      .lean();

    console.log(`✅ Successfully updated parking queue!`);
    console.log(`   Queue ID: ${updatedQueue._id}`);
    console.log(`   New Airport: ${updatedQueue.airportId?.name || 'N/A'} (ID: ${updatedQueue.airportId?._id || updatedQueue.airportId})`);
    console.log(`   Parking Lot: ${updatedQueue.parkingLotId?.name || 'N/A'}`);
    console.log(`\n🎉 Parking queue is now linked to ${airport.name}!`);
    console.log(`\n📝 Next steps:`);
    console.log(`   1. Drivers at ${airport.name} will now be routed to the correct parking lot`);
    console.log(`   2. Test by having a driver go to the airport location`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error fixing parking queue:', error);
    process.exit(1);
  }
};

fixParkingQueueAirport();

