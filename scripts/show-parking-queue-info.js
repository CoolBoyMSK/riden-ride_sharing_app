import mongoose from 'mongoose';
import connectDB from '../src/config/db.js';
import Zone from '../src/models/Zone.js';
import ParkingQueue from '../src/models/ParkingQueue.js';
import Fare from '../src/models/fareManagement.js';

const showParkingQueueInfo = async () => {
  try {
    await connectDB();
    console.log('✅ Connected to database\n');

    // Find all parking queues
    const parkingQueues = await ParkingQueue.find({ isActive: true })
      .populate('parkingLotId')
      .lean();

    console.log('📊 PARKING QUEUE INFORMATION\n');
    console.log('='.repeat(80));

    for (const queue of parkingQueues) {
      console.log(`\n🅿️  Parking Queue ID: ${queue._id}`);
      console.log(`   Parking Lot: ${queue.parkingLotId?.name || 'N/A'}`);
      console.log(`   Parking Lot ID: ${queue.parkingLotId?._id || 'N/A'}`);
      
      // Get airport info
      const airportId = queue.airportId;
      
      if (airportId) {
        // Try to find in Zone collection
        let airport = await Zone.findById(airportId).lean();
        
        if (airport) {
          console.log(`\n✈️  Airport Information (from Zone):`);
          console.log(`   Airport ID: ${airport._id}`);
          console.log(`   Airport Name: ${airport.name}`);
          if (airport.boundaries?.coordinates) {
            const coords = airport.boundaries.coordinates[0];
            if (coords && coords.length > 0) {
              const centerLng = coords.reduce((sum, c) => sum + c[0], 0) / coords.length;
              const centerLat = coords.reduce((sum, c) => sum + c[1], 0) / coords.length;
              console.log(`   Airport Coordinates: [${centerLng.toFixed(6)}, ${centerLat.toFixed(6)}]`);
            }
          }
        } else {
          // Try to find in FareManagement
          const fareZone = await Fare.findOne({
            $or: [
              { _id: airportId },
              { 'zone._id': airportId },
            ],
          }).lean();

          if (fareZone && fareZone.zone) {
            console.log(`\n✈️  Airport Information (from FareManagement):`);
            console.log(`   Airport ID: ${fareZone.zone._id || fareZone._id}`);
            console.log(`   Airport Name: ${fareZone.zone.name || 'N/A'}`);
            if (fareZone.zone.boundaries?.coordinates) {
              const coords = fareZone.zone.boundaries.coordinates[0];
              if (coords && coords.length > 0) {
                const centerLng = coords.reduce((sum, c) => sum + c[0], 0) / coords.length;
                const centerLat = coords.reduce((sum, c) => sum + c[1], 0) / coords.length;
                console.log(`   Airport Coordinates: [${centerLng.toFixed(6)}, ${centerLat.toFixed(6)}]`);
              }
            }
          } else {
            console.log(`\n⚠️  Airport ID: ${airportId} (Not found in Zone or FareManagement)`);
          }
        }
      } else {
        console.log(`\n⚠️  Airport ID: null (Not linked)`);
      }

      console.log(`\n📋 Queue Status:`);
      console.log(`   Active: ${queue.isActive}`);
      console.log(`   Drivers in Queue: ${queue.driverQueue?.length || 0}`);
      console.log(`   Active Offers: ${queue.activeOffers?.length || 0}`);
      console.log(`   Max Queue Size: ${queue.maxQueueSize || 100}`);
      console.log('-'.repeat(80));
    }

    console.log(`\n✅ Total Parking Queues: ${parkingQueues.length}`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

showParkingQueueInfo();

