import mongoose from 'mongoose';
import connectDB from '../src/config/db.js';
import Zone from '../src/models/Zone.js';
import ParkingQueue from '../src/models/ParkingQueue.js';

const findAirportFromParking = async () => {
  try {
    await connectDB();
    console.log('✅ Connected to database\n');

    // Vancouver Airport Parking Zone ID
    const parkingZoneId = '6914299ca3ab632220e579e7';

    console.log(`🔍 Finding parking zone: ${parkingZoneId}...`);
    const parkingZone = await Zone.findById(parkingZoneId);

    if (!parkingZone) {
      console.log(`❌ Parking zone not found!`);
      process.exit(1);
    }

    console.log(`✅ Found parking zone:`);
    console.log(`   Name: ${parkingZone.name}`);
    console.log(`   Type: ${parkingZone.type}`);
    console.log(`   ID: ${parkingZone._id}`);

    // Try to find airport via ParkingQueue
    console.log(`\n🔍 Searching for related airport via ParkingQueue...`);
    const parkingQueue = await ParkingQueue.findOne({
      parkingLotId: parkingZone._id,
    })
      .populate('airportId')
      .populate('parkingLotId');

    if (parkingQueue && parkingQueue.airportId) {
      console.log(`\n✅ Found airport via ParkingQueue:`);
      console.log(`   Airport ID: ${parkingQueue.airportId._id}`);
      console.log(`   Airport Name: ${parkingQueue.airportId.name}`);
      console.log(`   Airport Type: ${parkingQueue.airportId.type}`);
      console.log(`\n📋 Use this Airport ID for creating parking:`);
      console.log(`   ${parkingQueue.airportId._id}`);
      process.exit(0);
    }

    // If not found via ParkingQueue, try to find nearest airport
    console.log(`\n🔍 ParkingQueue not found. Searching for nearest airport...`);
    
    if (!parkingZone.boundaries || !parkingZone.boundaries.coordinates) {
      console.log(`❌ Parking zone has no boundaries!`);
      process.exit(1);
    }

    // Get center of parking zone
    const coordinates = parkingZone.boundaries.coordinates[0];
    let sumLng = 0;
    let sumLat = 0;
    let count = 0;

    for (const coord of coordinates) {
      if (Array.isArray(coord) && coord.length >= 2) {
        const [lng, lat] = coord;
        sumLng += lng;
        sumLat += lat;
        count++;
      }
    }

    const centerLng = sumLng / count;
    const centerLat = sumLat / count;

    console.log(`   Parking Zone Center: [${centerLng.toFixed(6)}, ${centerLat.toFixed(6)}]`);

    // Find nearest airport zone
    const nearestAirport = await Zone.aggregate([
      {
        $geoNear: {
          near: {
            type: 'Point',
            coordinates: [centerLng, centerLat],
          },
          distanceField: 'distance',
          spherical: true,
          key: 'boundaries',
          maxDistance: 500000, // 500km
        },
      },
      {
        $match: {
          type: 'airport',
          isActive: true,
        },
      },
      {
        $project: {
          _id: 1,
          name: 1,
          type: 1,
          distance: 1,
          distanceKm: { $divide: ['$distance', 1000] },
        },
      },
      {
        $sort: {
          distance: 1,
        },
      },
      {
        $limit: 1,
      },
    ]);

    if (nearestAirport.length > 0) {
      const airport = nearestAirport[0];
      console.log(`\n✅ Found nearest airport:`);
      console.log(`   Airport ID: ${airport._id}`);
      console.log(`   Airport Name: ${airport.name}`);
      console.log(`   Distance: ${airport.distanceKm.toFixed(2)} km`);
      console.log(`\n📋 Use this Airport ID for creating parking:`);
      console.log(`   ${airport._id}`);
    } else {
      console.log(`\n⚠️  No airport found within 500km radius!`);
      console.log(`\n💡 You need to:`);
      console.log(`   1. Create an airport zone (type: "airport")`);
      console.log(`   2. Then use that airport ID to create parking`);
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error finding airport:', error);
    process.exit(1);
  }
};

findAirportFromParking();


