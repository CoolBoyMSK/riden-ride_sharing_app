import mongoose from 'mongoose';
import connectDB from '../src/config/db.js';
import Zone from '../src/models/Zone.js';
import ParkingQueue from '../src/models/ParkingQueue.js';

const createAirportFromParking = async () => {
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

    if (!parkingZone.boundaries || !parkingZone.boundaries.coordinates) {
      console.log(`❌ Parking zone has no boundaries!`);
      process.exit(1);
    }

    // Extract airport name from parking zone name
    // "VANCOUVER INTERNATIONAL AIRPORT Parking" -> "VANCOUVER INTERNATIONAL AIRPORT"
    const airportName = parkingZone.name.replace(/\s*Parking\s*$/i, '').trim();
    
    console.log(`\n📝 Extracted airport name: ${airportName}`);

    // Check if airport already exists
    const existingAirport = await Zone.findOne({
      name: { $regex: new RegExp(`^${airportName}$`, 'i') },
      type: 'airport',
    });

    if (existingAirport) {
      console.log(`\n✅ Airport already exists:`);
      console.log(`   Airport ID: ${existingAirport._id}`);
      console.log(`   Airport Name: ${existingAirport.name}`);
      console.log(`\n📋 Use this Airport ID for creating parking:`);
      console.log(`   ${existingAirport._id}`);
      
      // Try to link parking queue if not already linked
      const parkingQueue = await ParkingQueue.findOne({
        parkingLotId: parkingZone._id,
      });

      if (!parkingQueue) {
        console.log(`\n🔗 Creating parking queue link...`);
        try {
          await ParkingQueue.create({
            parkingLotId: parkingZone._id,
            airportId: existingAirport._id,
          });
          console.log(`✅ Parking queue linked successfully!`);
        } catch (error) {
          console.log(`⚠️  Could not create parking queue: ${error.message}`);
        }
      } else {
        console.log(`\n✅ Parking queue already exists and is linked!`);
      }
      
      process.exit(0);
    }

    // Get parking zone boundaries and create a larger airport zone
    const parkingCoords = parkingZone.boundaries.coordinates[0];
    
    // Calculate center
    let sumLng = 0;
    let sumLat = 0;
    let count = 0;

    for (const coord of parkingCoords) {
      if (Array.isArray(coord) && coord.length >= 2) {
        const [lng, lat] = coord;
        sumLng += lng;
        sumLat += lat;
        count++;
      }
    }

    const centerLng = sumLng / count;
    const centerLat = sumLat / count;

    console.log(`\n📍 Parking Zone Center: [${centerLng.toFixed(6)}, ${centerLat.toFixed(6)}]`);

    // Create airport zone boundaries (larger area around parking)
    // Airport zone should be bigger than parking zone
    // Let's make it approximately 2km x 2km (0.018 degrees ≈ 2km)
    const airportSize = 0.018; // ~2km in degrees

    const airportCoordinates = [
      [
        [centerLng - airportSize, centerLat - airportSize], // Bottom-left
        [centerLng + airportSize, centerLat - airportSize], // Bottom-right
        [centerLng + airportSize, centerLat + airportSize], // Top-right
        [centerLng - airportSize, centerLat + airportSize], // Top-left
        [centerLng - airportSize, centerLat - airportSize], // Close polygon
      ],
    ];

    console.log(`\n🛫 Creating airport zone (2km x 2km area):`);
    airportCoordinates[0].forEach((c, i) => {
      console.log(`   Point ${i + 1}: [${c[0].toFixed(6)}, ${c[1].toFixed(6)}]`);
    });

    // Create airport zone
    console.log(`\n🔄 Creating airport zone...`);
    const airportZone = await Zone.create({
      name: airportName,
      type: 'airport',
      boundaries: {
        type: 'Polygon',
        coordinates: airportCoordinates,
      },
      minSearchRadius: 3,
      maxSearchRadius: 8,
      minRadiusSearchTime: 1,
      maxRadiusSearchTime: 3,
      isActive: true,
      description: `Airport zone for ${airportName}`,
      metadata: {
        createdFrom: parkingZoneId,
        createdVia: 'create-airport-from-parking-script',
      },
    });

    console.log(`✅ Airport zone created successfully!`);
    console.log(`   Airport ID: ${airportZone._id}`);
    console.log(`   Airport Name: ${airportZone.name}`);
    console.log(`   Airport Type: ${airportZone.type}`);

    // Create parking queue link
    console.log(`\n🔗 Creating parking queue link...`);
    try {
      const parkingQueue = await ParkingQueue.create({
        parkingLotId: parkingZone._id,
        airportId: airportZone._id,
      });
      console.log(`✅ Parking queue linked successfully!`);
      console.log(`   Parking Queue ID: ${parkingQueue._id}`);
    } catch (error) {
      if (error.code === 11000) {
        console.log(`✅ Parking queue already exists!`);
      } else {
        console.log(`⚠️  Could not create parking queue: ${error.message}`);
      }
    }

    console.log(`\n📋 Use this Airport ID for creating parking:`);
    console.log(`   ${airportZone._id}`);
    console.log(`\n🎉 Done! Airport zone created and linked to parking.`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating airport:', error);
    process.exit(1);
  }
};

createAirportFromParking();


