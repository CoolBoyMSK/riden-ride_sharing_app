import mongoose from 'mongoose';
import connectDB from '../src/config/db.js';
import RideModel from '../src/models/Ride.js';

const SEARCH_TERM = '69d7f8';

const findRide = async () => {
  try {
    // Connect to database
    await connectDB();
    console.log('✅ Connected to database');

    // Try different search patterns
    console.log(`\n🔍 Searching for ride with term: ${SEARCH_TERM}\n`);

    // 1. Search by rideId field (partial match)
    const ridesByRideId = await RideModel.find({
      rideId: { $regex: SEARCH_TERM, $options: 'i' },
    })
      .populate('passengerId', 'userId')
      .populate('driverId', 'userId')
      .lean()
      .limit(10);

    console.log(`Found ${ridesByRideId.length} ride(s) by rideId field:`);
    ridesByRideId.forEach((ride) => {
      console.log(`  - _id: ${ride._id}`);
      console.log(`    rideId: ${ride.rideId || 'N/A'}`);
      console.log(`    status: ${ride.status}`);
      console.log(`    isScheduledRide: ${ride.isScheduledRide}`);
      console.log(`    scheduledTime: ${ride.scheduledTime || 'N/A'}`);
      console.log('');
    });

    // 2. Search by ObjectId (if it's a partial ObjectId)
    if (mongoose.Types.ObjectId.isValid(SEARCH_TERM)) {
      const rideById = await RideModel.findById(SEARCH_TERM)
        .populate('passengerId', 'userId')
        .populate('driverId', 'userId')
        .lean();
      if (rideById) {
        console.log(`Found ride by ObjectId:`);
        console.log(`  - _id: ${rideById._id}`);
        console.log(`    rideId: ${rideById.rideId || 'N/A'}`);
        console.log(`    status: ${rideById.status}`);
        console.log(`    isScheduledRide: ${rideById.isScheduledRide}`);
        console.log(`    scheduledTime: ${rideById.scheduledTime || 'N/A'}`);
        console.log('');
      }
    }

    // 3. Search by ObjectId pattern (if SEARCH_TERM is part of an ObjectId)
    // Try to find ObjectIds that contain the search term
    const allRides = await RideModel.find({
      $or: [
        { _id: { $regex: SEARCH_TERM, $options: 'i' } },
        { rideId: { $regex: SEARCH_TERM, $options: 'i' } },
      ],
    })
      .populate('passengerId', 'userId')
      .populate('driverId', 'userId')
      .lean()
      .limit(20);

    if (allRides.length > 0) {
      console.log(`\nFound ${allRides.length} ride(s) matching pattern:`);
      allRides.forEach((ride) => {
        console.log(`  - _id: ${ride._id}`);
        console.log(`    rideId: ${ride.rideId || 'N/A'}`);
        console.log(`    status: ${ride.status}`);
        console.log(`    isScheduledRide: ${ride.isScheduledRide}`);
        console.log(`    scheduledTime: ${ride.scheduledTime || 'N/A'}`);
        console.log(`    passengerId: ${ride.passengerId?._id || ride.passengerId || 'N/A'}`);
        console.log('');
      });
    } else {
      console.log('\n❌ No rides found matching the search term');
      console.log('\n💡 Try searching with a different ID or check if the ride exists in the database');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error searching for ride:', error);
    process.exit(1);
  }
};

findRide();


