import mongoose from 'mongoose';
import connectDB from '../src/config/db.js';
import { findRideById, findRideByRideId, updateRideById } from '../src/dal/ride.js';
import { cancelPaymentHold } from '../src/dal/stripe.js';
import { notifyUser } from '../src/dal/notification.js';
import RideModel from '../src/models/Ride.js';

const RIDE_ID = '69d7f8';

const cancelScheduledRide = async () => {
  try {
    // Connect to database
    await connectDB();
    console.log('✅ Connected to database');

    // Try to find ride by MongoDB ObjectId first
    let ride = null;
    if (mongoose.Types.ObjectId.isValid(RIDE_ID)) {
      ride = await findRideById(RIDE_ID);
    }

    // If not found, try to find by rideId field
    if (!ride) {
      ride = await findRideByRideId(RIDE_ID);
    }

    // If still not found, search for scheduled rides with partial match
    if (!ride) {
      console.log(`🔍 Searching for scheduled rides matching: ${RIDE_ID}`);
      const rides = await RideModel.find({
        isScheduledRide: true,
        $or: [
          { rideId: { $regex: RIDE_ID, $options: 'i' } },
          // Convert _id to string for regex search
          { $expr: { $regexMatch: { input: { $toString: '$_id' }, regex: RIDE_ID, options: 'i' } } },
        ],
      })
        .populate('passengerId', 'userId')
        .populate('driverId', 'userId')
        .lean()
        .limit(10);

      if (rides.length === 0) {
        console.error(`❌ Ride not found with ID: ${RIDE_ID}`);
        console.log('\n💡 Please check the ride ID. It should be either:');
        console.log('   - A full MongoDB ObjectId (24 hex characters)');
        console.log('   - A rideId field value (e.g., "ride_xxxxx")');
        process.exit(1);
      } else if (rides.length === 1) {
        ride = rides[0];
        console.log(`✅ Found ride: ${ride._id}`);
      } else {
        console.log(`\n⚠️  Found ${rides.length} scheduled rides matching the pattern:`);
        rides.forEach((r, idx) => {
          console.log(`\n${idx + 1}. _id: ${r._id}`);
          console.log(`   rideId: ${r.rideId || 'N/A'}`);
          console.log(`   status: ${r.status}`);
          console.log(`   scheduledTime: ${r.scheduledTime || 'N/A'}`);
        });
        console.log('\n❌ Please provide the full ride ID to cancel a specific ride');
        process.exit(1);
      }
    }

    console.log(`✅ Found ride: ${ride._id}`);
    console.log(`   Status: ${ride.status}`);
    console.log(`   Scheduled: ${ride.isScheduledRide}`);
    console.log(`   Scheduled Time: ${ride.scheduledTime}`);
    console.log(`   Payment Intent ID: ${ride.paymentIntentId || 'N/A'}`);

    // Check if ride is already cancelled
    if (
      ride.status === 'CANCELLED_BY_PASSENGER' ||
      ride.status === 'CANCELLED_BY_DRIVER' ||
      ride.status === 'CANCELLED_BY_SYSTEM' ||
      ride.status === 'RIDE_COMPLETED'
    ) {
      console.log(`⚠️  Ride is already in status: ${ride.status}`);
      process.exit(0);
    }

    // Cancel payment hold if exists
    if (ride.paymentIntentId) {
      console.log(`🔄 Cancelling payment hold: ${ride.paymentIntentId}`);
      const cancelResult = await cancelPaymentHold(ride.paymentIntentId);
      if (cancelResult.success) {
        console.log('✅ Payment hold cancelled successfully');
      } else {
        console.error('⚠️  Failed to cancel payment hold:', cancelResult.error);
      }
    }

    // Update ride status
    console.log('🔄 Updating ride status to CANCELLED_BY_SYSTEM...');
    const cancelledRide = await updateRideById(ride._id, {
      status: 'CANCELLED_BY_SYSTEM',
      cancelledBy: 'system',
      cancellationReason: 'Cancelled by admin script',
      paymentStatus: 'CANCELLED',
      cancelledAt: new Date(),
    });

    if (!cancelledRide) {
      console.error('❌ Failed to update ride status');
      process.exit(1);
    }

    console.log('✅ Ride status updated successfully');

    // Notify passenger if passengerId exists
    // Handle different passengerId formats (populated object or ObjectId)
    const passengerUserId =
      cancelledRide.passengerId?.userId?._id?.toString() ||
      cancelledRide.passengerId?.userId?.toString() ||
      cancelledRide.passengerId?.userId ||
      ride.passengerId?.userId?._id?.toString() ||
      ride.passengerId?.userId?.toString() ||
      ride.passengerId?.userId;

    if (passengerUserId) {
      console.log(`📧 Sending notification to passenger: ${passengerUserId}`);
      try {
        await notifyUser({
          userId: passengerUserId,
          title: 'Scheduled Ride Cancelled',
          message: 'Your scheduled ride has been cancelled by the system',
          module: 'ride',
          metadata: cancelledRide,
          type: 'ALERT',
        });
        console.log('✅ Notification sent successfully');
      } catch (notifyError) {
        console.error('⚠️  Failed to send notification:', notifyError.message);
      }
    } else {
      console.log('⚠️  Could not determine passenger userId for notification');
    }

    console.log('\n✅ Ride cancellation completed successfully!');
    console.log(`   Ride ID: ${cancelledRide._id}`);
    console.log(`   Status: ${cancelledRide.status}`);
    console.log(`   Cancelled At: ${cancelledRide.cancelledAt}`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error cancelling ride:', error);
    process.exit(1);
  }
};

cancelScheduledRide();

