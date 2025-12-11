import mongoose from 'mongoose';
import {
  findAllBookingsByDriverId,
  findScheduledBookingsByDriverId,
  createBookingReportByDriverId,
  findBookingById,
  createBookingDriverRating,
  findReceipt,
} from '../../../../dal/booking.js';
import { findDriverByUserId, findDriverData } from '../../../../dal/driver.js';
import {
  findActiveRideByDriver,
  upsertDriverLocation,
  saveDriverLocation,
  persistDriverLocationToDB,
  getDriverLocation,
  isRideInRestrictedArea,
  isDriverInParkingLot,
  findNearestParkingForPickup,
  addDriverToQueue,
  findDriverParkingQueue,
  removeDriverFromQueue,
} from '../../../../dal/ride.js';
import { generateRideReceipt } from '../../../../utils/receiptGenerator.js';
import { createAdminNotification } from '../../../../dal/notification.js';
import { emitToRide, emitToUser } from '../../../../realtime/socket.js';
import { updateDriverByUserId } from '../../../../dal/driver.js';
import Zone from '../../../../models/Zone.js';
import env from '../../../../config/envConfig.js';

export const getAllBookings = async (user, { page, limit }, resp) => {
  try {
    const driver = await findDriverByUserId(user._id);
    if (!driver) {
      resp.error = true;
      resp.error_message = 'Failed to fetch driver';
      return resp;
    }

    const success = await findAllBookingsByDriverId(driver._id, page, limit);
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to fetch bookings';
      return resp;
    }

    resp.data = success;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'something went wrong';
    return resp;
  }
};

export const getScheduledBookings = async (user, { page, limit }, resp) => {
  try {
    const driver = await findDriverByUserId(user._id);
    if (!driver) {
      resp.error = true;
      resp.error_message = 'Failed to fetch driver';
      return resp;
    }

    const success = await findScheduledBookingsByDriverId(
      driver._id,
      page,
      limit,
    );
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to fetch scheduled bookings';
      return resp;
    }

    resp.data = success;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'something went wrong';
    return resp;
  }
};

export const getBookingById = async (user, { id }, resp) => {
  try {
    const driver = await findDriverByUserId(user._id);
    if (!driver) {
      resp.error = true;
      resp.error_message = 'Failed to fetch driver';
      return resp;
    }

    const success = await findBookingById(driver._id, id);
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to fetch booking';
      return resp;
    }

    resp.data = success;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'something went wrong';
    return resp;
  }
};

export const addBookingReport = async (user, { id }, { reason }, resp) => {
  try {
    const driver = await findDriverData(user._id);
    if (!driver) {
      resp.error = true;
      resp.error_message = 'Failed to fetch driver';
      return resp;
    }

    const success = await createBookingReportByDriverId(driver._id, id, reason);
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to report booking';
      return resp;
    }

    const notify = await createAdminNotification({
      title: 'Issue Reported',
      message: `A driver ${driver.userId?.name} has reported an issue that needs your attention.`,
      metadata: success,
      module: 'report_management',
      type: 'ALERT',
      actionLink: `${env.FRONTEND_URL}/api/admin/support/report?id=${success._id}`,
    });
    if (!notify) {
      console.error('Failed to send notification');
    }

    resp.data = success;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'something went wrong';
    return resp;
  }
};

export const rateBooking = async (user, { id }, { rating, feedback }, resp) => {
  try {
    const driver = await findDriverData(user._id);
    if (!driver) {
      resp.error = true;
      resp.error_message = 'Failed to fetch driver';
      return resp;
    }

    if (typeof rating !== 'number' || rating < 1 || rating > 5) {
      resp.error = true;
      resp.error_message = 'Rating must be a number between 1 and 5';
      return resp;
    } else if (feedback && (feedback.length < 3 || feedback.length > 500)) {
      resp.error = true;
      resp.error_message = 'Feedback must be between 3 and 500 characters';
      return resp;
    }

    const success = await createBookingDriverRating(
      driver._id,
      id,
      rating,
      feedback,
    );
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to report booking';
      return resp;
    }

    resp.data = success;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'something went wrong';
    return resp;
  }
};

export const generateReceipt = async ({ id }, resp) => {
  try {
    const exists = await findReceipt(id);
    if (exists) {
      resp.error = true;
      resp.error_message = 'receipt already exists';
      return resp;
    }

    const success = await generateRideReceipt(id, 'driver');
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to generate receipt';
      return resp;
    }

    resp.data = success;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'something went wrong';
    return resp;
  }
};

export const downloadReceipt = async ({ id }, res, resp) => {
  try {
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      resp.error = true;
      resp.error_message = 'Invalid ride ID provided';
      return resp;
    }

    // Generate driver receipt on-the-fly
    console.log(
      `📄 [downloadReceipt][driver] Generating driver receipt for ride ${id}...`,
    );

    const generated = await generateRideReceipt(id, 'driver');

    if (!generated?.success) {
      console.error(
        `❌ [downloadReceipt][driver] Failed to generate receipt for ride ${id}:`,
        generated?.error,
      );
      resp.error = true;
      resp.error_message =
        generated?.error || 'Failed to generate receipt for this ride';
      return resp;
    }

    // Get the PDF buffer from the generated receipt
    const pdfBuffer = Buffer.from(generated.receipt.base64, 'base64');

    if (!pdfBuffer || pdfBuffer.length < 100) {
      console.error(
        `❌ [downloadReceipt][driver] Invalid PDF data for ride ${id}`,
      );
      resp.error = true;
      resp.error_message = 'Receipt PDF data is invalid';
      return resp;
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${generated.receipt.fileName || `receipt-${id}-driver.pdf`}"`,
    );
    res.setHeader('Content-Length', pdfBuffer.length);

    resp.data = pdfBuffer;
    return resp;
  } catch (error) {
    console.error(`❌ [downloadReceipt][driver] Error for ride ${id}:`, {
      message: error.message,
      stack: error.stack,
    });
    resp.error = true;
    resp.error_message = error.message || 'something went wrong';
    return resp;
  }
};

export const updateLocation = async (user, { coordinates, heading, speed, accuracy }, resp) => {
  try {
    const driver = await findDriverByUserId(user._id);
    if (!driver) {
      resp.error = true;
      resp.error_message = 'Failed to fetch driver';
      return resp;
    }

    // Validate driver status
    if (!driver.isActive || driver.status !== 'online') {
      resp.error = true;
      resp.error_message = 'Driver must be online and active';
      return resp;
    }

    // Get previous location state to detect entry/exit
    const previousLocation = await getDriverLocation(driver._id);
    // Check if driver was in restricted area in previous location
    let wasRestricted = false;
    if (previousLocation) {
      try {
        const wasInRestrictedArea = await isRideInRestrictedArea([
          previousLocation.coordinates[0],
          previousLocation.coordinates[1],
        ]);
        wasRestricted = wasInRestrictedArea;
      } catch (error) {
        wasRestricted = driver.isRestricted;
      }
    }
    const wasInParkingLot = previousLocation?.parkingQueueId ? true : false;

    // Check airport status
    let isRestricted = false;
    let isParkingLot = false;
    
    try {
      isRestricted = await isRideInRestrictedArea(coordinates);
      console.log(`🔍 Airport Detection Result: isRestricted = ${isRestricted}`);
    } catch (error) {
      console.error(`❌ Error checking restricted area:`, error);
    }
    
    try {
      // Check if driver is in parking lot (within boundaries or within 100m radius)
      isParkingLot = await isDriverInParkingLot(coordinates, 100); // 100 meters radius
      console.log(`🔍 Parking Lot Detection Result: isParkingLot = ${isParkingLot ? 'Found' : 'Not Found'}`);
      if (isParkingLot) {
        console.log(`   Parking Lot ID: ${isParkingLot._id}`);
        console.log(`   Parking Lot Name: ${isParkingLot.name || 'N/A'}`);
      }
    } catch (error) {
      console.error(`❌ Error checking parking lot:`, error);
    }
    
    // Debug: Check if any airport zones exist
    const airportZones = await Zone.find({ type: 'airport', isActive: true }).lean();
    console.log(`\n🔍 DEBUG: Found ${airportZones.length} active airport zone(s) in database`);
    if (airportZones.length > 0) {
      for (const zone of airportZones) {
        const index = airportZones.indexOf(zone) + 1;
        console.log(`   Zone ${index}: ${zone.name || 'N/A'} (ID: ${zone._id})`);
        console.log(`   Has boundaries: ${zone.boundaries ? 'Yes' : 'No'}`);
        if (zone.boundaries && zone.boundaries.coordinates) {
          console.log(`   Boundaries type: ${zone.boundaries.type}`);
          console.log(`   Coordinates count: ${zone.boundaries.coordinates[0]?.length || 0}`);
          
          // Check if coordinates are within this zone
          if (zone.boundaries.type === 'Polygon' && zone.boundaries.coordinates[0]) {
            const boundaryCoords = zone.boundaries.coordinates[0];
            console.log(`   Boundary coordinates (first 3):`);
            for (let i = 0; i < Math.min(3, boundaryCoords.length); i++) {
              const coord = boundaryCoords[i];
              console.log(`     Point ${i + 1}: [${coord[0]}, ${coord[1]}]`);
            }
            
            // Try to check if point is within using MongoDB query
            const testZone = await Zone.findOne({
              _id: zone._id,
              boundaries: {
                $geoIntersects: {
                  $geometry: {
                    type: 'Point',
                    coordinates: coordinates,
                  },
                },
              },
            }).lean();
            
            console.log(`   📍 Test coordinates [${coordinates[0]}, ${coordinates[1]}] within this zone: ${testZone ? 'YES ✅' : 'NO ❌'}`);
          }
        }
      }
    } else {
      console.log(`   ⚠️ WARNING: No active airport zones found in database!`);
      console.log(`   Please check if airport zone is properly configured in admin panel.`);
    }

    // Debug: Check if any parking lot zones exist
    const parkingLotZones = await Zone.find({ type: 'airport-parking', isActive: true }).lean();
    console.log(`\n🅿️ DEBUG: Found ${parkingLotZones.length} active parking lot zone(s) in database`);
    if (parkingLotZones.length > 0) {
      for (const zone of parkingLotZones) {
        const index = parkingLotZones.indexOf(zone) + 1;
        console.log(`   Parking Lot ${index}: ${zone.name || 'N/A'} (ID: ${zone._id})`);
        console.log(`   Has boundaries: ${zone.boundaries ? 'Yes' : 'No'}`);
        if (zone.boundaries && zone.boundaries.coordinates) {
          console.log(`   Boundaries type: ${zone.boundaries.type}`);
          console.log(`   Coordinates count: ${zone.boundaries.coordinates[0]?.length || 0}`);
          
          // Check if coordinates are within this parking lot
          if (zone.boundaries.type === 'Polygon' && zone.boundaries.coordinates[0]) {
            const boundaryCoords = zone.boundaries.coordinates[0];
            console.log(`   Boundary coordinates (first 3):`);
            for (let i = 0; i < Math.min(3, boundaryCoords.length); i++) {
              const coord = boundaryCoords[i];
              console.log(`     Point ${i + 1}: [${coord[0]}, ${coord[1]}]`);
            }
            
            // Try to check if point is within using MongoDB query
            const testParkingLot = await Zone.findOne({
              _id: zone._id,
              boundaries: {
                $geoIntersects: {
                  $geometry: {
                    type: 'Point',
                    coordinates: coordinates,
                  },
                },
              },
            }).lean();
            
            console.log(`   📍 Test coordinates [${coordinates[0]}, ${coordinates[1]}] within this parking lot: ${testParkingLot ? 'YES ✅' : 'NO ❌'}`);
          }
        }
      }
    } else {
      console.log(`   ⚠️ WARNING: No active parking lot zones found in database!`);
      console.log(`   Please create parking lot zone with type: 'airport-parking' in admin panel.`);
      console.log(`   Parking lot zone must be INSIDE airport boundaries.`);
    }

    // ========== CONSOLE LOGS FOR AIRPORT TRACKING ==========
    console.log('\n' + '='.repeat(80));
    console.log('📍 DRIVER LOCATION UPDATE (REST API)');
    console.log('='.repeat(80));
    console.log(`👤 Driver ID: ${driver._id}`);
    console.log(`👤 Driver Name: ${driver.userId?.name || 'N/A'}`);
    console.log(`⏰ Timestamp: ${new Date().toISOString()}`);
    console.log(`📍 Current Location:`);
    console.log(`   Longitude: ${coordinates[0]}`);
    console.log(`   Latitude: ${coordinates[1]}`);
    console.log(`   Speed: ${speed || 0} km/h`);
    console.log(`   Heading: ${heading || 0}°`);
    console.log(`\n🏢 AIRPORT STATUS:`);
    console.log(`   isRestricted: ${isRestricted}`);
    console.log(`   isParkingLot: ${isParkingLot}`);
    console.log(`   Previous Restricted: ${wasRestricted}`);
    console.log(`   Previous In Parking: ${wasInParkingLot}`);
    
    // Detect airport entry/exit
    if (!wasRestricted && isRestricted) {
      console.log(`\n🚨 EVENT: DRIVER ENTERED AIRPORT RESTRICTED AREA`);
      console.log(`   Entry Time: ${new Date().toISOString()}`);
      console.log(`   Entry Location: [${coordinates[0]}, ${coordinates[1]}]`);
    } else if (wasRestricted && !isRestricted) {
      console.log(`\n✅ EVENT: DRIVER EXITED AIRPORT RESTRICTED AREA`);
      console.log(`   Exit Time: ${new Date().toISOString()}`);
      console.log(`   Exit Location: [${coordinates[0]}, ${coordinates[1]}]`);
    }

    // Detect parking lot entry/exit
    if (!wasInParkingLot && isParkingLot) {
      console.log(`\n🅿️ EVENT: DRIVER ENTERED PARKING LOT`);
      console.log(`   Entry Time: ${new Date().toISOString()}`);
      console.log(`   Entry Location: [${coordinates[0]}, ${coordinates[1]}]`);
    } else if (wasInParkingLot && !isParkingLot) {
      console.log(`\n🚗 EVENT: DRIVER EXITED PARKING LOT`);
      console.log(`   Exit Time: ${new Date().toISOString()}`);
      console.log(`   Exit Location: [${coordinates[0]}, ${coordinates[1]}]`);
    }

    // Current status summary
    if (isRestricted && !isParkingLot) {
      console.log(`\n⚠️ STATUS: Driver is in RESTRICTED AREA (Airport but not parking)`);
      console.log(`   Action Required: Navigate to parking lot`);
    } else if (isParkingLot) {
      console.log(`\n✅ STATUS: Driver is in PARKING LOT`);
      console.log(`   Action: Can receive airport rides`);
    } else {
      console.log(`\n🌍 STATUS: Driver is OUTSIDE airport area`);
      console.log(`   Action: Normal ride operations`);
    }
    console.log('='.repeat(80) + '\n');
    // ========== END CONSOLE LOGS ==========

    let responseData = {};
    let responseCode = null;
    let responseMessage = 'Location updated successfully';

    // Update isRestricted based on current location
    // If driver is in restricted area → isRestricted = true
    // If driver is not in restricted area → isRestricted = false
    if (isRestricted && !isParkingLot) {
      // Driver is in restricted area (but not in parking lot)
      await updateDriverByUserId(user._id, { isRestricted: true });
      const parkingLot = await findNearestParkingForPickup(coordinates);

      await saveDriverLocation(driver._id, {
        lng: coordinates[0],
        lat: coordinates[1],
        status: driver.status,
        parkingQueueId: null,
        isAvailable: true,
        speed: speed || 0,
        heading: heading || 0,
      });

      const driverLocation = await persistDriverLocationToDB(driver._id.toString());

      if (driverLocation) {
        responseCode = 'RESTRICTED_AREA';
        responseMessage = 'You are inside the restricted area, and you are not allowed to pick ride in this area, reach to nearby parking lot to pick rides';
        responseData = {
          ...(parkingLot || {}),
          isFirstEntry: !wasRestricted, // true if driver just entered, false if already in restricted area
        };

        // Emit popup ONLY if driver just entered restricted area (first time)
        // Don't emit if driver is already in restricted area (wasRestricted = true)
        // This means: emit only on transition from non-restricted to restricted
        if (!wasRestricted) {
          console.log(`📢 Emitting RESTRICTED_AREA socket event (driver entered restricted area)`);
          emitToUser(user._id, 'ride:driver_update_location', {
            success: true,
            objectType: 'driver-update-location',
            data: {
              ...parkingLot,
              isFirstEntry: true,
            },
            code: 'RESTRICTED_AREA',
            message: responseMessage,
          });
        } else {
          console.log(`🔇 Skipping socket event (driver already in restricted area - popup already shown)`);
        }
      }
    } else {
      // Driver is not in restricted area → set isRestricted = false
      await updateDriverByUserId(user._id, { isRestricted: false });
    }

    // Handle parking lot
    if (isParkingLot) {
      let queue;
      let parkingQueue = null;
      try {
        parkingQueue = await findDriverParkingQueue(isParkingLot._id);
        if (parkingQueue) {
          queue = await addDriverToQueue(isParkingLot._id, driver._id);
          console.log(`✅ Driver added to queue. Queue Size: ${queue?.queueSize || 'N/A'}`);
          console.log(`   Queue Position: ${queue?.position || 'N/A'}`);
        } else {
          console.log(`⚠️ Parking queue not found for parking lot: ${isParkingLot._id}`);
        }
      } catch (error) {
        console.error(`❌ Error adding driver to parking queue:`, error);
        parkingQueue = null; // Ensure it's null on error
      }

      await updateDriverByUserId(user._id, { isRestricted: false });

      await saveDriverLocation(driver._id, {
        lng: coordinates[0],
        lat: coordinates[1],
        status: driver.status,
        parkingQueueId: parkingQueue ? parkingQueue._id : null,
        isAvailable: true,
        speed: speed || 0,
        heading: heading || 0,
      });

      const driverLocation = await persistDriverLocationToDB(driver._id.toString());

      if (driverLocation) {
        responseCode = 'PARKING_LOT';
        responseMessage = 'You are within the premises of airport parking lot, You can pick rides now';
        responseData = queue || {};
        
        // Emit socket event to driver
        emitToUser(user._id, 'ride:driver_update_location', {
          success: true,
          objectType: 'driver-update-location',
          data: queue,
          code: 'PARKING_LOT',
          message: responseMessage,
        });
      }
    }
    // Handle outside airport
    else {
      const currentLocation = await getDriverLocation(driver._id);
      if (
        currentLocation &&
        currentLocation.parkingQueueId &&
        currentLocation.parkingQueueId !== null
      ) {
        console.log(`\n🚗 PROCESSING: Removing driver from parking queue (exited parking lot)...`);
        await removeDriverFromQueue(
          driver._id,
          currentLocation.parkingQueueId,
        );
        await updateDriverByUserId(user._id, { isRestricted: false });
        console.log(`✅ Driver removed from parking queue`);
      }

      await saveDriverLocation(driver._id, {
        lng: coordinates[0],
        lat: coordinates[1],
        status: driver.status,
        parkingQueueId: null,
        isAvailable: true,
        speed: speed || 0,
        heading: heading || 0,
      });

      const driverLocation = await persistDriverLocationToDB(driver._id.toString());

      if (driverLocation.currentRideId) {
        emitToRide(driverLocation.currentRideId, 'ride:driver_update_location', {
          success: true,
          objectType: 'driver-update-location',
          data: driverLocation.location,
          message: 'Location updated successfully',
        });
      }

      // Don't emit normal location update event if driver is in restricted area
      // This prevents popup from disappearing automatically
      // Only emit if driver is truly outside restricted area
      if (!isRestricted) {
        emitToUser(user._id, 'ride:driver_update_location', {
          success: true,
          objectType: 'driver-update-location',
          data: driverLocation.location,
          message: 'Location updated successfully',
        });
      }

      responseData = driverLocation;
    }

    // Also update via upsertDriverLocation for backward compatibility
    const location = { type: 'Point', coordinates };
    const updatedLocation = await upsertDriverLocation(driver._id, {
      location,
      heading: heading || 0,
      speed: speed || 0,
      accuracy: accuracy || 5,
    });

    resp.data = {
      ...updatedLocation.toObject(),
      code: responseCode,
      message: responseMessage,
      ...responseData,
    };
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'something went wrong';
    return resp;
  }
};
