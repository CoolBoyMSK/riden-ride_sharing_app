import { Server } from 'socket.io';
import Redis from 'ioredis';
import { createAdapter } from '@socket.io/redis-adapter';
import {
  addSocket,
  removeSocket,
  getSocketIds,
  isOnline,
} from '../utils/onlineUsers.js';
import env from '../config/envConfig.js';
import { verifyAccessToken } from '../utils/auth.js';
import {
  createMessage,
  findChatRoomByRideId,
  updateChatById,
  markAllRideMessagesAsRead,
  editMessage,
  findMessageById,
  deleteMessage,
} from '../dal/chat.js';
import {
  findRideByRideId,
  findDriverLocation,
  findPendingRides,
  updateRideById,
  findRideById,
  saveDriverLocation,
  persistDriverLocationToDB,
  updateDriverAvailability,
  findNearbyRideRequests,
  findNearestParkingForPickup,
  filterRidesForDriver,
  addDriverToQueue,
  removeDriverFromQueue,
  isDriverInParkingLot,
  isRideInRestrictedArea,
  offerRideToParkingQueue,
  handleDriverResponse,
  findActiveRide,
  createFeedback,
  deductRidenCommission,
  updateDriverRideHistory,
  createRideTransaction,
  getPayoutWeek,
} from '../dal/ride.js';
import {
  findDriverByUserId,
  updateDriverByUserId,
  findAllDestination,
  findDriverById,
} from '../dal/driver.js';
import { calculateActualFare } from '../services/User/ride/fareCalculationService.js';
import { findPassengerByUserId, findPassengerById } from '../dal/passenger.js';
import { passengerPaysDriver, payDriverFromWallet } from '../dal/stripe.js';
import { createCallLog, findCallById, updateCallLogById } from '../dal/call.js';
import { findDashboardData } from '../dal/admin/index.js';
import { findUserById } from '../dal/user/index.js';
import { notifyUser } from '../dal/notification.js';
import { generateAgoraToken } from '../utils/agoraTokenGenerator.js';
import { generateRideReceipt } from '../utils/receiptGenerator.js';
import {
  sendPassengerRideCancellationWarningEmail,
  sendDriverRideCancellationEmail,
} from '../templates/emails/user/index.js';
import mongoose from 'mongoose';

let ioInstance = null;

export const initSocket = (server) => {
  if (ioInstance) return ioInstance;

  const io = new Server(server, {
    cors: {
      origin: env.FRONTEND_URL || '*',
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: true,
    },
  });

  if (env.REDIS_URL) {
    const pubClient = new Redis(env.REDIS_URL);
    const subClient = pubClient.duplicate();
    io.adapter(createAdapter(pubClient, subClient));
  }

  // JWT Authentication middleware for socket connections
  io.use((socket, next) => {
    const authHeader =
      socket.handshake.auth?.token || socket.handshake.headers?.authorization;
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : authHeader;
    const payload = token ? verifyAccessToken(token) : null;

    if (!payload?.id) {
      return next(new Error('Unauthorized'));
    }

    socket.user = { id: payload.id, roles: payload.roles || [] };
    next();
  });

  io.on('connection', (socket) => {
    const userId = socket.user.id;
    console.log(`🔌 User ${userId} connected to socket`);

    // add to online registry
    addSocket(userId, socket.id).catch(console.error);

    // Join user's personal room for direct notifications
    socket.join(`user:${userId}`);

    socket.on('ride:active', async () => {
      const objectType = 'active-ride';
      try {
        let user;
        if (['driver'].includes(socket.user.roles[0])) {
          user = await findDriverByUserId(userId);

          if (
            !user ||
            user.isBlocked ||
            user.isSuspended ||
            user.backgroundCheckStatus !== 'approved' ||
            !['online', 'on_ride'].includes(user.status)
          ) {
            return socket.emit('ride:active', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Forbidden: Driver not eligible',
            });
          }
        } else if (['passenger'].includes(socket.user.roles[0])) {
          user = await findPassengerByUserId(userId);

          if (!user || user.isBlocked || user.isSuspended) {
            return socket.emit('ride:active', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Forbidden: Passenger not eligible',
            });
          }
        }

        const ride = await findActiveRide(user._id, socket.user.roles[0]);
        if (ride) {
          socket.join(`ride:${ride._id}`);
          io.to(`ride:${ride._id}`).emit('ride:active', {
            success: true,
            objectType,
            data: ride,
            message: `${socket.user.roles[0]} re-joined the ride successfully`,
          });
        }
      } catch (error) {
        console.error(`SOCKET ERROR: ${error}`);
        return socket.emit('error', {
          success: false,
          objectType,
          code: error.code || 'SOCKET_ERROR',
          message: `SOCKET ERROR: ${error.message}`,
        });
      }
    });

    // Driver Events
    socket.on('ride:find', async () => {
      const objectType = 'find-ride';
      try {
        const driver = await findDriverByUserId(userId);
        if (
          !driver ||
          driver.isRestricted ||
          driver.isBlocked ||
          driver.isSuspended ||
          driver.backgroundCheckStatus !== 'approved' ||
          driver.status !== 'online'
        ) {
          return socket.emit('ride:find', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Forbidden: Driver not eligible',
          });
        }

        const driverLocation = await findDriverLocation(driver._id);
        if (!driverLocation || !driverLocation.isAvailable) {
          return socket.emit('ride:find', {
            success: false,
            objectType,
            code: 'LOCATION_UNAVAILABLE',
            message: 'Driver location unavailable or not marked as available',
          });
        }

        const [lng, lat] = driverLocation.location.coordinates;
        const driverCoords = { latitude: lat, longitude: lng };

        const driverInParkingLot = isDriverInParkingLot(driverCoords);
        let restrictedRides = [];
        if (driverInParkingLot) {
          restrictedRides = await findPendingRides(
            driver.vehicle.type,
            driverLocation.location.coordinates,
            10000,
            { limit: 5 },
          );

          restrictedRides.forEach((ride) => offerRideToParkingQueue(ride, io));
        }

        const availableRides = await findPendingRides(
          driver.vehicle.type,
          driverLocation.location.coordinates,
          10000,
          { limit: 10 },
        );

        // Exclude restricted rides already offered
        const restrictedRideIds = restrictedRides.map((r) => r._id.toString());
        const filteredRides = filterRidesForDriver(
          availableRides.filter(
            (r) => !restrictedRideIds.includes(r._id.toString()),
          ),
          driverCoords,
          10,
          1,
        );

        socket.emit('ride:find', {
          success: true,
          objectType,
          rides: filteredRides,
          message: `${filteredRides.length} available rides found`,
        });
      } catch (error) {
        console.error(`SOCKET ERROR: ${error}`);
        return socket.emit('error', {
          success: false,
          objectType,
          code: error.code || 'SOCKET_ERROR',
          message: `SOCKET ERROR: ${error.message}`,
        });
      }
    });

    socket.on('ride:response', async ({ rideId, driverResponse }) => {
      const objectType = 'airport-parking-offer-response';
      try {
        const driver = await findDriverByUserId(userId);
        if (
          !driver ||
          driver.isRestricted ||
          driver.isBlocked ||
          driver.isSuspended ||
          driver.backgroundCheckStatus !== 'approved' ||
          driver.status !== 'online'
        ) {
          return socket.emit('ride:response', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Forbidden: Driver not eligible',
          });
        }

        await handleDriverResponse(
          rideId,
          driver,
          driverResponse,
          io,
          socket,
          objectType,
        );
      } catch (error) {
        console.error(`SOCKET ERROR: ${error}`);
        socket.emit('error', {
          success: false,
          objectType,
          code: `${error.code || 'SOCKET_ERROR'}`,
          message: `SOCKET ERROR: ${error.message}`,
        });
      }
    });

    socket.on('ride:decline_ride', async ({ rideId }) => {
      const objectType = 'decline-ride';
      try {
        const driver = await findDriverByUserId(userId);
        if (
          !driver ||
          driver.isRestricted ||
          driver.isBlocked ||
          driver.isSuspended ||
          driver.backgroundCheckStatus !== 'approved' ||
          driver.status !== 'online'
        ) {
          return socket.emit('ride:decline_ride', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Forbidden: Driver not eligible',
          });
        }

        const driverLocation = await findDriverLocation(driver._id);
        if (!driverLocation || !driverLocation.isAvailable) {
          return socket.emit('ride:decline_ride', {
            success: false,
            objectType,
            code: 'LOCATION_UNAVAILABLE',
            message: 'Driver location unavailable or not marked as available',
          });
        }

        const ride = await findRideById(rideId);
        if (!ride) {
          return socket.emit('ride:decline_ride', {
            success: false,
            objectType,
            code: 'NOT_FOUND',
            message: 'Ride not found',
          });
        }

        if (ride.driverId?.toString() === driver._id.toString()) {
          return socket.emit('ride:decline_ride', {
            success: false,
            objectType,
            code: 'ALREADY_ASSIGNED',
            message: 'Cannot decline a ride already assigned to you',
          });
        }

        // Fetch replacement rides
        const replacementRides = await findPendingRides(
          driver.vehicle.type,
          driverLocation.location.coordinates,
          10000,
          { excludeIds: [rideId], limit: 10 },
        );

        socket.emit('ride:decline_ride', {
          success: true,
          objectType,
          data: replacementRides,
          message: 'Ride declined successfully',
        });
      } catch (error) {
        console.error(`SOCKET ERROR: ${error}`);
        socket.emit('error', {
          success: false,
          objectType,
          code: `${error.code || 'SOCKET_ERROR'}`,
          message: `SOCKET ERROR: ${error.message}`,
        });
      }
    });

    socket.on('ride:accept_ride', async ({ rideId }) => {
      const objectType = 'accept-ride';
      try {
        const driver = await findDriverByUserId(userId);
        if (
          !driver ||
          driver.isRestricted ||
          driver.isBlocked ||
          driver.isSuspended ||
          driver.backgroundCheckStatus !== 'approved' ||
          driver.status !== 'online'
        ) {
          return socket.emit('ride:accept_ride', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Forbidden: Driver not eligible',
          });
        }

        const ride = await findRideById(rideId);
        if (!ride) {
          return socket.emit('ride:accept_ride', {
            success: false,
            objectType,
            code: 'NOT_FOUND',
            message: 'Ride not found',
          });
        } else if (ride.driverId) {
          return socket.emit('ride:accept_ride', {
            success: false,
            objectType,
            code: 'ALREADY_ASSIGNED',
            message: 'Ride already assigned to another driver',
          });
        }

        const availability = await findDriverLocation(driver._id);
        if (
          !availability ||
          availability.isAvailable === false ||
          availability.currentRideId
        ) {
          return socket.emit('ride:accept_ride', {
            success: false,
            objectType,
            code: 'NOT_AVAILABLE',
            message: 'You are not available to accept the ride',
          });
        }

        let isDestinationRide = false;
        if (driver.isDestination) {
          isDestinationRide = true;
        }

        const updatedRide = await updateRideById(ride._id, {
          status: 'DRIVER_ASSIGNED',
          driverId: driver._id,
          driverAssignedAt: new Date(),
          isDestinationRide,
        });
        if (!updatedRide) {
          return socket.emit('ride:accept_ride', {
            success: false,
            objectType,
            code: 'RIDE_UPDATE_FAILED',
            message: 'Failed to update ride with driver assignment',
          });
        }

        const updateAvailability = await updateDriverAvailability(
          driver._id,
          false,
          ride._id,
        );

        const updatedDriver = await updateDriverByUserId(userId, {
          status: 'on_ride',
        });

        if (!updatedDriver || !updateAvailability) {
          // Rollback ride update inside the transaction
          await updateRideById(ride._id, {
            driverId: null,
            status: 'REQUESTED',
          });
          await updateDriverAvailability(driver._id, true, null);
          return socket.emit('ride:accept_ride', {
            success: false,
            objectType,
            code: 'DRIVER_UPDATE_FAILED',
            message: 'Failed to update driver status',
          });
        }

        socket.join(`ride:${updatedRide._id}`);
        io.to(`ride:${ride._id}`).emit('ride:accept_ride', {
          success: true,
          objectType,
          data: updatedRide,
          message: `Ride successfully assigned to ${updatedRide.driverId?.userId?.name}`,
        });
      } catch (error) {
        console.error(`SOCKET ERROR: ${error}`);
        socket.emit('error', {
          success: false,
          objectType,
          code: `${error.code || 'SOCKET_ERROR'}`,
          message: `SOCKET ERROR: ${error.message}`,
        });
      }
    });

    socket.on('ride:driver_cancel_ride', async ({ rideId, reason }) => {
      const objectType = 'cancel-ride-driver';
      const session = await mongoose.startSession();
      try {
        const driver = await findDriverByUserId(userId);
        if (
          !driver ||
          driver.isRestricted ||
          driver.isBlocked ||
          driver.isSuspended ||
          driver.backgroundCheckStatus !== 'approved' ||
          driver.status !== 'on_ride'
        ) {
          return socket.emit('ride:driver_cancel_ride', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Forbidden: Driver not eligible',
          });
        }

        const ride = await findRideById(rideId);
        const driverId = ride?.driverId?._id;
        if (!ride) {
          return socket.emit('ride:driver_cancel_ride', {
            success: false,
            objectType,
            code: 'NOT_FOUND',
            message: 'Ride not found',
          });
        } else if (driverId.toString() !== driver._id.toString()) {
          return socket.emit('ride:driver_cancel_ride', {
            success: false,
            objectType,
            code: 'NOT_ASSIGNED',
            message: 'Cannot cancel a ride not assigned to you',
          });
        } else if (ride.status === 'CANCELLED_BY_PASSENGER') {
          return socket.emit('ride:driver_cancel_ride', {
            success: false,
            objectType,
            code: 'ALREADY_CANCELLED',
            message: 'Ride already cancelled by passenger',
          });
        } else if (ride.status === 'CANCELLED_BY_DRIVER') {
          return socket.emit('ride:driver_cancel_ride', {
            success: false,
            objectType,
            code: 'ALREADY_CANCELLED',
            message: 'You have already cancelled this ride',
          });
        } else if (ride.status === 'CANCELLED_BY_SYSTEM') {
          return socket.emit('ride:driver_cancel_ride', {
            success: false,
            objectType,
            code: 'ALREADY_CANCELLED',
            message: 'Ride already cancelled by system',
          });
        } else if (ride.status === 'RIDE_COMPLETED') {
          return socket.emit('ride:driver_cancel_ride', {
            success: false,
            objectType,
            code: 'ALREADY_COMPLETED',
            message: 'Cannot cancel a completed ride',
          });
        } else if (!ride.passengerId) {
          return socket.emit('ride:driver_cancel_ride', {
            success: false,
            objectType,
            code: 'NO_PASSENGER_AVAILABLE',
            message: 'Cannot cancel ride. No passenger available',
          });
        }

        const cancellableStatuses = [
          'DRIVER_ASSIGNED',
          'DRIVER_ARRIVING',
          'DRIVER_ARRIVED',
          'RIDE_STARTED',
          'RIDE_IN_PROGRESS',
        ];

        if (!cancellableStatuses.includes(ride.status)) {
          return socket.emit('ride:driver_cancel_ride', {
            success: false,
            objectType,
            code: 'CANNOT_CANCEL',
            message: `Cannot cancel ride. Current status: ${ride.status}`,
          });
        }

        if (!reason || reason.trim().length < 3 || reason.trim().length > 500) {
          return socket.emit('ride:driver_cancel_ride', {
            success: false,
            objectType,
            code: 'INVALID_REASON',
            message: 'Cancellation reason must be between 3 and 500 characters',
          });
        }

        session.startTransaction();

        const updateAvailability = await updateDriverAvailability(
          driver._id,
          true,
          null,
          { session },
        );
        if (!updateAvailability) {
          await session.abortTransaction();
          return socket.emit('ride:driver_cancel_ride', {
            success: false,
            objectType,
            code: 'DRIVER AVAILABILITY_FAILED',
            message: 'Failed to update driver availability',
          });
        }

        const updatedDriver = await updateDriverByUserId(
          userId,
          {
            status: 'online',
          },
          { session },
        );
        if (!updatedDriver) {
          await session.abortTransaction();
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'DRIVER_UPDATE_FAILED',
            message: 'Failed to update driver status',
          });
        }

        const updatedRide = await updateRideById(
          ride._id,
          {
            status: 'CANCELLED_BY_DRIVER',
            cancelledBy: 'driver',
            cancellationReason: reason.trim(),
            paymentStatus: 'CANCELLED',
          },
          { session },
        );
        if (!updatedRide) {
          await session.abortTransaction();
          return socket.emit('ride:driver_cancel_ride', {
            success: false,
            objectType,
            code: 'CANCELLATION_FAILED',
            message: 'Failed to cancel ride',
          });
        } else if (updatedRide.status !== 'CANCELLED_BY_DRIVER') {
          await session.abortTransaction();
          return socket.emit('ride:driver_cancel_ride', {
            success: false,
            objectType,
            code: 'RIDE_UPDATE_FAILED',
            message: 'Failed to update ride status',
          });
        }

        await session.commitTransaction();

        const mailTo = await findUserById(ride.driverId?.userId);
        if (!mailTo) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'NOT_FOUND',
            message: 'Driver not found',
          });
        }

        await sendDriverRideCancellationEmail(
          mailTo.userId?.email,
          mailTo.userId?.name,
        );

        // Notify passenger of ride cancellation
        socket.join(`ride:${updatedRide._id}`);
        io.to(`ride:${updatedRide._id}`).emit('ride:driver_cancel_ride', {
          success: true,
          objectType,
          data: updatedRide,
          message: 'Ride cancelled by driver',
        });

        // Notification Logic Start
        const notify = await notifyUser({
          userId: ride.passengerId?.userId,
          title: 'Ride Cancelled',
          message: `Your ride has been cancelled. We're sorry for the inconvenience. You can book a new ride anytime from the home screen.`,
          module: 'ride',
          metadata: updatedRide,
          type: 'ALERT',
          actionLink: `ride_cancelled`,
        });
        if (!notify) {
          console.error('Failed to send notification');
        }
        // Notification Logic End

        const rooms = Array.from(socket.rooms);
        if (rooms.includes(`ride:${ride._id}`)) {
          socket.leave(`ride:${ride._id}`);
        }

        const clients = await io.in(`ride:${ride._id}`).fetchSockets();
        clients.forEach((s) => s.leave(`ride:${ride._id}`));

        socket.emit('ride:driver_cancel_ride', {
          success: true,
          objectType,
          message: 'You have left the ride room after cancellation.',
        });
      } catch (error) {
        console.error(`SOCKET ERROR: ${error}`);
        return socket.emit('error', {
          success: false,
          objectType,
          code: `${error.code || 'SOCKET_ERROR'}`,
          message: `SOCKET ERROR: ${error.message}`,
        });
      } finally {
        session.endSession();
      }
    });

    socket.on('ride:driver_arriving', async ({ rideId }) => {
      const objectType = 'driver-arriving';
      try {
        const driver = await findDriverByUserId(userId);
        if (
          !driver ||
          driver.isRestricted ||
          driver.isBlocked ||
          driver.isSuspended ||
          driver.backgroundCheckStatus !== 'approved' ||
          driver.status !== 'on_ride'
        ) {
          return socket.emit('ride:driver_arriving', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Forbidden: Driver not eligible',
          });
        }

        const ride = await findRideById(rideId);
        const driverId = ride?.driverId?._id;
        if (!ride) {
          return socket.emit('ride:driver_arriving', {
            success: false,
            objectType,
            code: 'NOT_FOUND',
            message: 'Ride not found',
          });
        } else if (driverId.toString() !== driver._id.toString()) {
          return socket.emit('ride:driver_arriving', {
            success: false,
            objectType,
            code: 'NOT_ASSIGNED',
            message: 'Cannot update a ride not assigned to you',
          });
        }

        if (ride.status !== 'DRIVER_ASSIGNED') {
          return socket.emit('ride:driver_arriving', {
            success: false,
            objectType,
            code: 'INVALID_STATUS',
            message: `Cannot mark as arriving. Current status: ${ride.status}`,
          });
        }

        const updatedRide = await updateRideById(ride._id, {
          status: 'DRIVER_ARRIVING',
          driverArrivingAt: new Date(),
        });
        if (!updatedRide) {
          return socket.emit('ride:driver_arriving', {
            success: false,
            objectType,
            code: 'RIDE_UPDATE_FAILED',
            message: 'Failed to update ride status',
          });
        }

        socket.join(`ride:${updatedRide._id}`);
        io.to(`ride:${ride._id}`).emit('ride:driver_arriving', {
          success: true,
          objectType,
          data: updatedRide,
          message: 'Ride status updated to DRIVER_ARRIVING',
        });
      } catch (error) {
        console.error(`SOCKET ERROR: ${error}`);
        return socket.emit('error', {
          success: false,
          objectType,
          code: `${error.code || 'SOCKET_ERROR'}`,
          message: `SOCKET ERROR: ${error.message}`,
        });
      }
    });

    socket.on('ride:driver_arrived', async ({ rideId }) => {
      const objectType = 'driver-arrived';
      try {
        const driver = await findDriverByUserId(userId);
        if (
          !driver ||
          driver.isRestricted ||
          driver.isBlocked ||
          driver.isSuspended ||
          driver.backgroundCheckStatus !== 'approved' ||
          driver.status !== 'on_ride'
        ) {
          return socket.emit('ride:driver_arrived', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Forbidden: Driver not eligible',
          });
        }

        const ride = await findRideById(rideId);
        const driverId = ride?.driverId?._id;

        if (!ride) {
          return socket.emit('ride:driver_arrived', {
            success: false,
            objectType,
            code: 'NOT_FOUND',
            message: 'Ride not found',
          });
        } else if (driverId.toString() !== driver._id.toString()) {
          return socket.emit('ride:driver_arrived', {
            success: false,
            objectType,
            code: 'NOT_ASSIGNED',
            message: 'Cannot update a ride not assigned to you',
          });
        }

        if (ride.status !== 'DRIVER_ARRIVING') {
          return socket.emit('ride:driver_arrived', {
            success: false,
            objectType,
            code: 'INVALID_STATUS',
            message: `Cannot mark as arrived. Current status: ${ride.status}`,
          });
        }

        const updatedRide = await updateRideById(ride._id, {
          status: 'DRIVER_ARRIVED',
          driverArrivedAt: new Date(),
        });
        if (!updatedRide) {
          return socket.emit('ride:driver_arrived', {
            success: false,
            objectType,
            code: 'RIDE_UPDATE_FAILED',
            message: 'Failed to update ride status',
          });
        }

        socket.join(`ride:${updatedRide._id}`);
        io.to(`ride:${ride._id}`).emit('ride:driver_arrived', {
          success: true,
          objectType,
          data: updatedRide,
          message: 'Ride status updated to DRIVER_ARRIVED',
        });
      } catch (error) {
        console.error(`SOCKET ERROR: ${error}`);
        return socket.emit('error', {
          success: false,
          objectType,
          code: `${error.code || 'SOCKET_ERROR'}`,
          message: `SOCKET ERROR: ${error.message}`,
        });
      }
    });

    socket.on('ride:driver_start_ride', async ({ rideId }) => {
      const objectType = 'driver-start-ride';
      try {
        const driver = await findDriverByUserId(userId);
        if (
          !driver ||
          driver.isRestricted ||
          driver.isBlocked ||
          driver.isSuspended ||
          driver.backgroundCheckStatus !== 'approved' ||
          driver.status !== 'on_ride'
        ) {
          return socket.emit('ride:driver_start_ride', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Forbidden: Driver not eligible',
          });
        }

        const ride = await findRideById(rideId);
        const driverId = ride?.driverId?._id;
        if (!ride) {
          return socket.emit('ride:driver_start_ride', {
            success: false,
            objectType,
            code: 'NOT_FOUND',
            message: 'Ride not found',
          });
        } else if (driverId.toString() !== driver._id.toString()) {
          return socket.emit('ride:driver_start_ride', {
            success: false,
            objectType,
            code: 'NOT_ASSIGNED',
            message: 'Cannot update a ride not assigned to you',
          });
        }

        if (ride.status !== 'DRIVER_ARRIVED') {
          return socket.emit('ride:driver_start_ride', {
            success: false,
            objectType,
            code: 'INVALID_STATUS',
            message: `Cannot start ride. Current status: ${ride.status}`,
          });
        }

        const updatedRide = await updateRideById(ride._id, {
          status: 'RIDE_STARTED',
          rideStartedAt: new Date(),
        });
        if (!updatedRide) {
          return socket.emit('ride:driver_start_ride', {
            success: false,
            objectType,
            code: 'RIDE_UPDATE_FAILED',
            message: 'Failed to update ride status',
          });
        }

        socket.join(`ride:${updatedRide._id}`);
        io.to(`ride:${ride._id}`).emit('ride:driver_start_ride', {
          success: true,
          objectType,
          data: updatedRide,
          message: 'Ride status updated to RIDE_STARTED',
        });
      } catch (error) {
        console.error(`SOCKET ERROR: ${error}`);
        return socket.emit('error', {
          success: false,
          objectType,
          code: `${error.code || 'SOCKET_ERROR'}`,
          message: `SOCKET ERROR: ${error.message}`,
        });
      }
    });

    socket.on(
      'ride:driver_complete_ride',
      async ({ rideId, actualDistance }) => {
        const objectType = 'driver-complete-ride';
        try {
          const driver = await findDriverByUserId(userId);
          if (
            !driver ||
            driver.isBlocked ||
            driver.isSuspended ||
            driver.backgroundCheckStatus !== 'approved' ||
            !['online', 'on_ride'].includes(driver.status)
          ) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Forbidden: Driver not eligible',
            });
          }

          const ride = await findRideById(rideId);
          const driverId = ride?.driverId?._id;
          if (!ride) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'NOT_FOUND',
              message: 'Ride not found',
            });
          } else if (driverId.toString() !== driver._id.toString()) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'NOT_ASSIGNED',
              message: 'Cannot update a ride not assigned to you',
            });
          }

          if (
            ride.status !== 'RIDE_STARTED' &&
            ride.status !== 'RIDE_IN_PROGRESS'
          ) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'INVALID_STATUS',
              message: `Cannot complete ride. Current status: ${ride.status}`,
            });
          }

          if (!actualDistance || Math.ceil(actualDistance) < 0) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'INVALID_DISTANCE',
              message: `Invalid Distance, Distance must be greater than 0 and positive`,
            });
          }

          const actualDuration =
            Date.now() - new Date(ride.driverAssignedAt).getTime();

          const waitingTime =
            new Date(ride.rideStartedAt).getTime() -
            new Date(ride.driverArrivedAt).getTime();

          const carType = ride.driverId?.vehicle?.type;

          const fareResult = await calculateActualFare({
            carType,
            actualDistance,
            actualDuration,
            waitingTime,
            promoCode: ride.promoCode,
            rideStartedAt: ride.rideStartedAt,
          });

          const updatedRide = await updateRideById(ride._id, {
            status: 'RIDE_COMPLETED',
            rideCompletedAt: new Date(),
            paymentStatus: 'PROCESSING',
            actualFare: Math.floor(fareResult.actualFare),
            actualDistance,
            actualDuration,
          });
          if (!updatedRide) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'RIDE_UPDATE_FAILED',
              message: 'Failed to update ride status',
            });
          }

          const updateAvailability = await updateDriverAvailability(
            driver._id,
            true,
            null,
          );
          if (!updateAvailability) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'DRIVER AVAILABILITY_FAILED',
              message: 'Failed to update driver availability',
            });
          }

          const updatedDriver = await updateDriverByUserId(userId, {
            status: 'online',
          });
          if (!updatedDriver) {
            // Rollback ride update
            await updateRideById(ride._id, {
              status: 'RIDE_STARTED',
              rideCompletedAt: null,
              paymentStatus: 'PENDING',
            });
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'DRIVER_UPDATE_FAILED',
              message: 'Failed to update driver status',
            });
          }

          const updatedDriverHistory = await updateDriverRideHistory(
            driver._id,
            ride._id,
          );
          if (!updatedDriverHistory) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'DRIVER_UPDATE_FAILED',
              message: 'Failed to update driver History',
            });
          }

          socket.join(`ride:${updatedRide._id}`);
          io.to(`ride:${updatedRide._id}`).emit('ride:driver_complete_ride', {
            success: true,
            objectType,
            data: updatedRide,
            message: 'Ride status updated to RIDE_COMPLETED',
          });
        } catch (error) {
          console.error(`SOCKET ERROR: ${error}`);
          return socket.emit('error', {
            success: false,
            objectType,
            code: `${error.code || 'SOCKET_ERROR'}`,
            message: `SOCKET ERROR: ${error.message}`,
          });
        }
      },
    );

    socket.on(
      'ride:driver_rate_passenger',
      async ({ rideId, rating, feedback }) => {
        const objectType = 'driver-rate-passenger';
        try {
          const driver = await findDriverByUserId(userId);
          if (
            !driver ||
            driver.isBlocked ||
            driver.isSuspended ||
            driver.backgroundCheckStatus !== 'approved' ||
            !['online', 'on_ride'].includes(driver.status)
          ) {
            return socket.emit('ride:driver_rate_passenger', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Forbidden: Driver not eligible',
            });
          }

          const ride = await findRideById(rideId);
          const driverId = ride?.driverId?._id;
          if (!ride) {
            return socket.emit('ride:driver_rate_passenger', {
              success: false,
              objectType,
              code: 'NOT_FOUND',
              message: 'Ride not found',
            });
          }

          if (driverId.toString() !== driver._id.toString()) {
            return socket.emit('ride:driver_rate_passenger', {
              success: false,
              objectType,
              code: 'NOT_ASSIGNED',
              message: 'Cannot rate passenger for a ride not assigned to you',
            });
          }

          if (ride.status !== 'RIDE_COMPLETED') {
            return socket.emit('ride:driver_rate_passenger', {
              success: false,
              objectType,
              code: 'INVALID_STATUS',
              message: `Cannot rate passenger. Current ride status: ${ride.status}`,
            });
          }

          if (ride.passengerRating) {
            return socket.emit('ride:driver_rate_passenger', {
              success: false,
              objectType,
              code: 'ALREADY_RATED',
              message: 'You have already rated this passenger for this ride',
            });
          }

          if (typeof rating !== 'number' || rating < 1 || rating > 5) {
            return socket.emit('ride:driver_rate_passenger', {
              success: false,
              objectType,
              code: 'INVALID_RATING',
              message: 'Rating must be a number between 1 and 5',
            });
          }

          if (feedback && (feedback.length < 3 || feedback.length > 500)) {
            return socket.emit('ride:driver_rate_passenger', {
              success: false,
              objectType,
              code: 'INVALID_FEEDBACK',
              message: 'Feedback must be between 3 and 500 characters',
            });
          }

          const payload = {
            passengerId: ride.passengerId,
            driverId: ride.driverId,
            rideId: ride._id,
            type: 'by_driver',
            rating,
            feedback,
          };
          const driverFeedback = await createFeedback(payload);
          if (!driverFeedback) {
            return socket.emit('ride:driver_rate_passenger', {
              success: false,
              objectType,
              code: 'IFEEDBACK_FAILED',
              message: 'Driver failed to send feedback for passenger',
            });
          }

          const updatedRide = await updateRideById(ride._id, {
            passengerRating: driverFeedback._id,
          });

          if (!updatedRide) {
            return socket.emit('ride:driver_rate_passenger', {
              success: false,
              objectType,
              code: 'RIDE_UPDATE_FAILED',
              message: 'Failed to save passenger rating',
            });
          }

          // Notification Logic Start
          const notify = await notifyUser({
            userId: ride.passengerId?.userId,
            title: 'Driver Rated You',
            message: `You passenger has gave you ${rating} star rating.`,
            module: 'ride',
            metadata: ride,
            type: 'ALERT',
            actionLink: `user_rated`,
          });
          if (!notify) {
            console.error('Failed to send notification');
          }
          // Notification Logic End

          // Notify passenger of new rating
          socket.join(`ride:${updatedRide._id}`);
          io.to(`ride:${ride._id}`).emit('ride:driver_rate_passenger', {
            success: true,
            objectType,
            data: updatedRide,
            message: 'Passenger rated successfully',
          });

          socket.leave(`ride:${ride._id}`);
          socket.emit('ride:driver_rate_passenger', {
            success: true,
            objectType,
            message: 'You have left the ride room after cancellation.',
          });
        } catch (error) {
          console.error(`SOCKET ERROR: ${error}`);
          return socket.emit('error', {
            success: false,
            objectType,
            code: `${error.code || 'SOCKET_ERROR'}`,
            message: `SOCKET ERROR: ${error.message}`,
          });
        }
      },
    );

    socket.on(
      'ride:driver_update_location',
      async ({ location, isAvailable, speed, heading }) => {
        const objectType = 'driver-update-location';
        try {
          const driver = await findDriverByUserId(userId);
          if (
            !driver ||
            driver.isBlocked ||
            driver.isSuspended ||
            driver.backgroundCheckStatus !== 'approved' ||
            !['online', 'on_ride'].includes(driver.status)
          ) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Forbidden: Driver not eligible',
            });
          }

          if (
            !location ||
            !Array.isArray(location.coordinates) ||
            location.coordinates.length !== 2 ||
            location.coordinates.some((c) => typeof c !== 'number')
          ) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'INVALID_LOCATION',
              message:
                'Location must be a GeoJSON Point [lng, lat] with valid numbers',
            });
          }

          if (typeof speed !== 'number' || !speed || speed < 0 || speed > 100) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'INVALID_SPEED',
              message: 'Speed must be greater 0 and less than 100',
            });
          }

          if (
            !heading ||
            typeof heading !== 'number' ||
            heading > 360 ||
            heading < 0
          ) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'INVALID_HEADING',
              message: 'Heading must be greater 0 and less than 360',
            });
          }

          if (typeof isAvailable !== 'boolean') {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'INVALID_AVAILABILITY',
              message: 'isAvailable must be a boolean',
            });
          }

          if (driver.status === 'on_ride' && isAvailable) {
            isAvailable = false;
          }

          const [lng, lat] = location.coordinates;
          const coordsObj = { latitude: lat, longitude: lng };

          const isRestricted = isRideInRestrictedArea(coordsObj); // returns boolean
          const isParkingLot = isDriverInParkingLot(coordsObj);

          if (isRestricted && !isParkingLot) {
            await updateDriverByUserId(userId, { isRestricted });
            const parkingLot = findNearestParkingForPickup(coordsObj);

            io.to(`user:${userId}`).emit('ride:driver_update_location', {
              success: true,
              objectType,
              code: 'RESTRICTED_AREA',
              message:
                "You are inside the restricted area, and you can't pick ride in this area, reach to nearby parking lot in order to be able to pick rides",
              data: parkingLot,
            });

            if (parkingLot?.parkingLotId) {
              await removeDriverFromQueue(driver._id);
            }
          } else if (isRestricted && isParkingLot) {
            const parkingLot = findNearestParkingForPickup(coordsObj);
            if (parkingLot?.parkingLotId) {
              await addDriverToQueue(parkingLot.parkingLotId, driver._id);
            }

            await updateDriverByUserId(userId, { isRestricted: false });

            io.to(`user:${userId}`).emit('ride:driver_update_location', {
              success: true,
              objectType,
              code: 'SAFE_AREA',
              message:
                'You are within the premises of safe aree, You can pick-up rides now',
            });
          } else {
            await removeDriverFromQueue(driver._id);

            await updateDriverByUserId(userId, { isRestricted: false });
          }

          await saveDriverLocation(driver._id, {
            lng: location.coordinates[0],
            lat: location.coordinates[1],
            isAvailable,
            speed,
            heading,
          });

          const driverLocation = await persistDriverLocationToDB(
            driver._id.toString(),
          ).catch((err) =>
            console.error(
              `Failed to persist driver location for driver ${driver._id}:`,
              err,
            ),
          );

          if (driverLocation.currentRideId) {
            io.to(`ride:${driverLocation.currentRideId}`).emit(
              'ride:driver_update_location',
              {
                success: true,
                objectType,
                data: driverLocation.location,
                message: 'Location updated successfully',
              },
            );
          }

          socket.emit('ride:driver_update_location', {
            success: true,
            objectType,
            data: driverLocation.location,
            message: 'Location updated successfully',
          });
        } catch (error) {
          console.error(`SOCKET ERROR (driver:${userId}):`, error);
          socket.emit('error', {
            success: false,
            objectType,
            code: error.code || 'SOCKET_ERROR',
            message: `SOCKET ERROR: ${error.message}`,
          });
        }
      },
    );

    socket.on('ride:find_destination_rides', async () => {
      const objectType = 'find-destination-rides';
      const MAX_RIDES = 10;

      try {
        const driver = await findDriverByUserId(userId);

        if (
          !driver ||
          driver.isRestricted ||
          driver.isBlocked ||
          driver.isSuspended ||
          driver.backgroundCheckStatus !== 'approved' ||
          driver.status !== 'online'
        ) {
          return socket.emit('ride:find_destination_rides', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Forbidden: Driver not eligible',
          });
        }

        const [destination, driverLocation] = await Promise.all([
          findAllDestination(driver._id),
          findDriverLocation(driver._id),
        ]);

        if (!destination) {
          return socket.emit('ride:find_destination_rides', {
            success: false,
            objectType,
            code: 'NO_DESTINATION',
            message: 'You have no destination enabled',
          });
        }

        if (!driverLocation) {
          return socket.emit('ride:find_destination_rides', {
            success: false,
            objectType,
            code: 'LOCATION_UNAVAILABLE',
            message: "Driver's location is not available",
          });
        }

        const destCoords = destination.location.coordinates;
        const driverCoords = driverLocation.location.coordinates;
        const rides = await findNearbyRideRequests(
          destCoords,
          driverCoords,
          5,
          MAX_RIDES,
        );

        if (!rides || rides.length === 0) {
          return socket.emit('ride:find_destination_rides', {
            success: true,
            objectType,
            data: {
              total: 0,
              rides: [],
            },
            message: 'No nearby rides found',
          });
        }

        // 4️⃣ Prepare response safely
        const responseData = {
          total: rides.length,
        };

        if (driver.isDestination) {
          responseData.rides = rides;
        }

        // 5️⃣ Emit final response
        socket.emit('ride:find_destination_rides', {
          success: true,
          objectType,
          data: responseData,
          message: 'Rides fetched successfully',
        });
      } catch (error) {
        console.error(`SOCKET ERROR (driver:${userId}):`, error);
        socket.emit('error', {
          success: false,
          objectType,
          code: error.code || 'SOCKET_ERROR',
          message: `SOCKET ERROR: ${error.message}`,
        });
      }
    });

    socket.on('ride:driver_join_ride', async ({ rideId }) => {
      const objectType = 'driver-join-ride';
      try {
        const driver = await findDriverByUserId(userId);
        if (
          !driver ||
          driver.isRestricted ||
          driver.isBlocked ||
          driver.isSuspended ||
          driver.backgroundCheckStatus !== 'approved' ||
          !['on_ride', 'online'].includes(driver.status)
        ) {
          return socket.emit('ride:driver_join_ride', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Forbidden: Driver not eligible',
          });
        }

        const ride = await findRideByRideId(rideId);
        const driverId = ride?.driverId?._id;
        if (!ride) {
          return socket.emit('ride:driver_join_ride', {
            success: false,
            objectType,
            code: 'NOT_FOUND',
            message: 'Ride not found',
          });
        } else if (driverId.toString() !== driver._id.toString()) {
          return socket.emit('ride:driver_join_ride', {
            success: false,
            objectType,
            code: 'NOT_OWNED',
            message: 'Cannot join a ride not booked by you',
          });
        } else if (ride.status === 'CANCELLED_BY_PASSENGER') {
          return socket.emit('ride:driver_join_ride', {
            success: false,
            objectType,
            code: 'ALREADY_CANCELLED',
            message: 'Ride already cancelled by you',
          });
        } else if (ride.status === 'CANCELLED_BY_DRIVER') {
          return socket.emit('ride:driver_join_ride', {
            success: false,
            objectType,
            code: 'CANCELLED_BY_DRIVER',
            message: 'Ride already cancelled by the driver',
          });
        } else if (ride.status === 'CANCELLED_BY_SYSTEM') {
          return socket.emit('ride:driver_join_ride', {
            success: false,
            objectType,
            code: 'ALREADY_CANCELLED',
            message: 'Ride already cancelled by system',
          });
        } else if (
          ride.status === 'RIDE_COMPLETED' &&
          ride.paymentStatus === 'COMPLETED'
        ) {
          return socket.emit('ride:driver_join_ride', {
            success: false,
            objectType,
            code: 'RIDE_COMPLETED',
            message: 'Cannot join a completed ride',
          });
        } else if (!ride.driverId) {
          return socket.emit('ride:driver_join_ride', {
            success: false,
            objectType,
            code: 'NO_DRIVER_FOUND',
            message: 'Cannot join ride. No driver found',
          });
        } else if (ride.status === 'REQUESTED') {
          return socket.emit('ride:driver_join_ride', {
            success: false,
            objectType,
            code: 'DRIVER_NOT_ASSIGNED',
            message: 'Cannot join ride. Driver not assigned yet',
          });
        }

        // Join ride room
        socket.join(`ride:${ride._id}`);
        io.to(`ride:${ride._id}`).emit('ride:driver_join_ride', {
          success: true,
          objectType,
          data: ride,
          message: 'Successfully joined ride room',
        });
      } catch (error) {
        console.error(`SOCKET ERROR: ${error}`);
        return socket.emit('error', {
          success: false,
          objectType,
          code: `${error.code || 'SOCKET_ERROR'}`,
          message: `SOCKET ERROR: ${error.message}`,
        });
      }
    });

    // Passenger Events
    socket.on('ride:passenger_join_ride', async ({ rideId }) => {
      const objectType = 'passenger-join-ride';
      try {
        const passenger = await findPassengerByUserId(userId);
        if (!passenger || passenger.isBlocked || passenger.isSuspended) {
          return socket.emit('ride:passenger_join_ride', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Forbidden: Passenger not eligible',
          });
        }

        const ride = await findRideByRideId(rideId);
        const passengerId = ride?.passengerId?._id;
        if (!ride) {
          return socket.emit('ride:passenger_join_ride', {
            success: false,
            objectType,
            code: 'NOT_FOUND',
            message: 'Ride not found',
          });
        } else if (passengerId.toString() !== passenger._id.toString()) {
          return socket.emit('ride:passenger_join_ride', {
            success: false,
            objectType,
            code: 'NOT_OWNED',
            message: 'Cannot join a ride not booked by you',
          });
        } else if (ride.status === 'CANCELLED_BY_PASSENGER') {
          return socket.emit('ride:passenger_join_ride', {
            success: false,
            objectType,
            code: 'ALREADY_CANCELLED',
            message: 'Ride already cancelled by you',
          });
        } else if (ride.status === 'CANCELLED_BY_DRIVER') {
          return socket.emit('ride:passenger_join_ride', {
            success: false,
            objectType,
            code: 'CANCELLED_BY_DRIVER',
            message: 'Ride already cancelled by the driver',
          });
        } else if (ride.status === 'CANCELLED_BY_SYSTEM') {
          return socket.emit('ride:passenger_join_ride', {
            success: false,
            objectType,
            code: 'ALREADY_CANCELLED',
            message: 'Ride already cancelled by system',
          });
        } else if (
          ride.status === 'RIDE_COMPLETED' &&
          ride.paymentStatus === 'COMPLETED'
        ) {
          return socket.emit('ride:passenger_join_ride', {
            success: false,
            objectType,
            code: 'RIDE_COMPLETED',
            message: 'Cannot join a completed ride',
          });
        } else if (!ride.driverId) {
          return socket.emit('ride:passenger_join_ride', {
            success: false,
            objectType,
            code: 'NO_DRIVER_ASSIGNED',
            message: 'Cannot join ride. No driver assigned yet',
          });
        } else if (ride.status === 'REQUESTED') {
          return socket.emit('ride:passenger_join_ride', {
            success: false,
            objectType,
            code: 'DRIVER_NOT_ASSIGNED',
            message: 'Cannot join ride. Driver not yet assigned',
          });
        }

        // Join ride room
        socket.join(`ride:${ride._id}`);
        io.to(`ride:${ride._id}`).emit('ride:passenger_join_ride', {
          success: true,
          objectType,
          data: ride,
          message: 'Successfully joined ride room',
        });
      } catch (error) {
        console.error(`SOCKET ERROR: ${error}`);
        return socket.emit('error', {
          success: false,
          objectType,
          code: `${error.code || 'SOCKET_ERROR'}`,
          message: `SOCKET ERROR: ${error.message}`,
        });
      }
    });

    socket.on('ride:passenger_cancel_ride', async ({ rideId, reason }) => {
      const objectType = 'cancel-ride-passenger';
      const session = await mongoose.startSession();
      try {
        const passenger = await findPassengerByUserId(userId);
        if (!passenger || passenger.isBlocked || passenger.isSuspended) {
          return socket.emit('ride:passenger_cancel_ride', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Forbidden: Passenger not eligible',
          });
        }

        const ride = await findRideById(rideId);
        const passengerId = ride?.passengerId?._id;
        if (!ride) {
          return socket.emit('ride:passenger_cancel_ride', {
            success: false,
            objectType,
            code: 'NOT_FOUND',
            message: 'Ride not found',
          });
        } else if (passengerId.toString() !== passenger._id.toString()) {
          return socket.emit('ride:passenger_cancel_ride', {
            success: false,
            objectType,
            code: 'NOT_OWNED',
            message: 'Cannot cancel a ride not booked by you',
          });
        } else if (ride.status === 'CANCELLED_BY_PASSENGER') {
          return socket.emit('ride:passenger_cancel_ride', {
            success: false,
            objectType,
            code: 'ALREADY_CANCELLED',
            message: 'Ride already cancelled by you',
          });
        } else if (ride.status === 'CANCELLED_BY_DRIVER') {
          return socket.emit('ride:passenger_cancel_ride', {
            success: false,
            objectType,
            code: 'CANCELLED_BY_DRIVER',
            message: 'Ride already cancelled by the driver',
          });
        } else if (ride.status === 'CANCELLED_BY_SYSTEM') {
          return socket.emit('ride:passenger_cancel_ride', {
            success: false,
            objectType,
            code: 'ALREADY_CANCELLED',
            message: 'Ride already cancelled by system',
          });
        } else if (ride.status === 'RIDE_COMPLETED') {
          return socket.emit('ride:passenger_cancel_ride', {
            success: false,
            objectType,
            code: 'RIDE_COMPLETED',
            message: 'Cannot cancel a completed ride',
          });
        }

        const cancellableStatuses = [
          'REQUESTED',
          'DRIVER_ASSIGNED',
          'DRIVER_ARRIVING',
          'DRIVER_ARRIVED',
        ];
        if (!cancellableStatuses.includes(ride.status)) {
          return socket.emit('ride:passenger_cancel_ride', {
            success: false,
            objectType,
            code: 'CANNOT_CANCEL',
            message: `Cannot cancel ride. Current status: ${ride.status}`,
          });
        }

        if (!reason || reason.trim().length < 3 || reason.trim().length > 500) {
          return socket.emit('ride:passenger_cancel_ride', {
            success: false,
            objectType,
            code: 'INVALID_REASON',
            message: 'Cancellation reason must be between 3 and 500 characters',
          });
        }

        session.startTransaction();

        if (ride.driverId) {
          const updateAvailability = await updateDriverAvailability(
            ride.driverId,
            true,
            null,
            { session },
          );
          if (!updateAvailability) {
            await session.abortTransaction();
            return socket.emit('ride:passenger_cancel_ride', {
              success: false,
              objectType,
              code: 'DRIVER_AVAILABILITY_FAILED',
              message: 'Failed to update driver availability',
            });
          }

          const updatedDriver = await updateDriverByUserId(
            ride.driverId?.userId,
            {
              status: 'online',
            },
            { session },
          );
          if (!updatedDriver) {
            await session.abortTransaction();
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'DRIVER_UPDATE_FAILED',
              message: 'Failed to update driver status',
            });
          }
        }

        const updatedRide = await updateRideById(
          ride._id,
          {
            status: 'CANCELLED_BY_PASSENGER',
            cancelledBy: 'passenger',
            cancellationReason: reason.trim(),
            paymentStatus: 'CANCELLED',
          },
          { session },
        );
        if (!updatedRide) {
          await session.abortTransaction();
          return socket.emit('ride:passenger_cancel_ride', {
            success: false,
            objectType,
            code: 'CANCELLATION_FAILED',
            message: 'Failed to cancel ride',
          });
        } else if (updatedRide.status !== 'CANCELLED_BY_PASSENGER') {
          await session.abortTransaction();
          return socket.emit('ride:passenger_cancel_ride', {
            success: false,
            objectType,
            code: 'RIDE_UPDATE_FAILED',
            message: 'Failed to update ride status',
          });
        }

        await session.commitTransaction();

        const mailTo = await findUserById(ride.passengerId?.userId);
        if (!mailTo) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'NOT_FOUND',
            message: 'Passenger not found',
          });
        }

        await sendPassengerRideCancellationWarningEmail(
          mailTo.userId?.email,
          mailTo.userId?.name,
        );

        socket.join(`ride:${updatedRide._id}`);
        io.to(`ride:${updatedRide._id}`).emit('ride:passenger_cancel_ride', {
          success: true,
          objectType,
          data: updatedRide,
          message: 'Ride successfully cancelled by passenger',
        });

        // Notification Logic Start
        if (ride.driverId) {
          const notify = await notifyUser({
            userId: ride.driverId?.userId,
            title: 'Ride Cancelled',
            message: `Passenger cancelled the ride — stay online to catch the next trip! `,
            module: 'ride',
            metadata: updatedRide,
            type: 'ALERT',
            actionLink: `ride_cancelled`,
          });
          if (!notify) {
            console.error('Failed to send notification');
          }
        }
        // Notification Logic End

        const rooms = Array.from(socket.rooms);
        if (rooms.includes(`ride:${ride._id}`)) {
          socket.leave(`ride:${ride._id}`);
        }

        const clients = await io.in(`ride:${ride._id}`).fetchSockets();
        clients.forEach((s) => s.leave(`ride:${ride._id}`));

        socket.emit('ride:passenger_cancel_ride', {
          success: true,
          objectType,
          message: 'You have left the ride room after cancellation.',
        });
      } catch (error) {
        await session.abortTransaction();
        console.error(`SOCKET ERROR: ${error}`);
        return socket.emit('error', {
          success: false,
          objectType,
          code: `${error.code || 'SOCKET_ERROR'}`,
          message: `SOCKET ERROR: ${error.message}`,
        });
      } finally {
        session.endSession();
      }
    });

    socket.on(
      'ride:passenger_rate_driver',
      async ({ rideId, rating, feedback }) => {
        const objectType = 'passenger-rate-driver';
        try {
          const passenger = await findPassengerByUserId(userId);
          if (!passenger || passenger.isBlocked || passenger.isSuspended) {
            return socket.emit('ride:passenger_rate_driver', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Forbidden: Passenger not eligible',
            });
          }

          const ride = await findRideById(rideId);
          const passengerId = ride?.passengerId?._id;
          if (!ride) {
            return socket.emit('ride:passenger_rate_driver', {
              success: false,
              objectType,
              code: 'NOT_FOUND',
              message: 'Ride not found',
            });
          } else if (ride.status !== 'RIDE_COMPLETED') {
            return socket.emit('ride:passenger_rate_driver', {
              success: false,
              objectType,
              code: 'INVALID_STATUS',
              message: `Cannot rate driver. Current ride status: ${ride.status}`,
            });
          } else if (ride.driverRating) {
            return socket.emit('ride:passenger_rate_driver', {
              success: false,
              objectType,
              code: 'ALREADY_RATED',
              message: 'You have already rated this driver for this ride',
            });
          } else if (typeof rating !== 'number' || rating < 1 || rating > 5) {
            return socket.emit('ride:passenger_rate_driver', {
              success: false,
              objectType,
              code: 'INVALID_RATING',
              message: 'Rating must be a number between 1 and 5',
            });
          } else if (
            feedback &&
            (feedback.length < 3 || feedback.length > 500)
          ) {
            return socket.emit('ride:passenger_rate_driver', {
              success: false,
              objectType,
              code: 'INVALID_FEEDBACK',
              message: 'Feedback must be between 3 and 500 characters',
            });
          } else if (passengerId.toString() !== passenger._id.toString()) {
            return socket.emit('ride:passenger_rate_driver', {
              success: false,
              objectType,
              code: 'NOT_OWNED',
              message: 'Cannot rate driver for a ride not booked by you',
            });
          }

          const payload = {
            passengerId: ride.passengerId,
            driverId: ride.driverId,
            rideId: ride._id,
            type: 'by_passenger',
            rating,
            feedback,
          };
          const passengerFeedback = await createFeedback(payload);
          if (!passengerFeedback) {
            return socket.emit('ride:driver_rate_passenger', {
              success: false,
              objectType,
              code: 'IFEEDBACK_FAILED',
              message: 'Passenger failed to send feedback for driver',
            });
          }

          const updatedRide = await updateRideById(ride._id, {
            driverRating: passengerFeedback._id,
          });

          if (!updatedRide) {
            return socket.emit('ride:passenger_rate_driver', {
              success: false,
              objectType,
              code: 'RIDE_UPDATE_FAILED',
              message: 'Failed to save driver rating',
            });
          }

          // Notification Logic Start
          const notify = await notifyUser({
            userId: ride.driverId?.userId,
            title: 'Passenger Rated You',
            message: `You passenger has gave you ${rating} star rating.`,
            module: 'ride',
            metadata: ride,
            type: 'ALERT',
            actionLink: `user_rated`,
          });
          if (!notify) {
            console.error('Failed to send notification');
          }
          // Notification Logic End

          socket.join(`ride:${updatedRide._id}`);
          io.to(`ride:${ride._id}`).emit('ride:passenger_rate_driver', {
            success: true,
            objectType,
            data: updatedRide,
            message: 'Driver rated successfully',
          });

          socket.leave(`ride:${ride._id}`);
          socket.emit('ride:passenger_rate_driver', {
            success: true,
            objectType,
            message: 'You successfully left ride room',
          });
        } catch (error) {
          console.error(`SOCKET ERROR: ${error}`);
          return socket.emit('error', {
            success: false,
            objectType,
            code: `${error.code || 'SOCKET_ERROR'}`,
            message: `SOCKET ERROR: ${error.message}`,
          });
        }
      },
    );

    socket.on('ride:tip_driver', async ({ rideId, percent, isApplied }) => {
      const objectType = 'tip-driver';
      try {
        const ride = await findRideById(rideId);
        const amount = Math.floor(
          ((ride.actualFare || ride.estimatedFare) / percent) * 100,
        );
        if (!ride) {
          return socket.emit('ride:tip_driver', {
            success: false,
            objectType,
            code: 'NOT_FOUND',
            message: 'Ride not found',
          });
        } else if (ride.status !== 'RIDE_COMPLETED') {
          return socket.emit('ride:tip_driver', {
            success: false,
            objectType,
            code: 'INVALID_STATUS',
            message: `Cannot rate driver. Current ride status: ${ride.status}`,
          });
        } else if (ride.tipBreakdown?.isApplied) {
          return socket.emit('ride:tip_driver', {
            success: false,
            objectType,
            code: 'ALLREADY_PAID',
            message: `You have already paid $${ride.tipBreakdown?.amount} which is ${ride.tipBreakdown?.percent}% of fare`,
          });
        } else if (isApplied !== true || amount <= 0 || percent <= 0) {
          return socket.emit('ride:tip_driver', {
            success: false,
            objectType,
            code: 'INVALID_AMOUNT',
            message: `Tip amount and percentage must be greter than 0`,
          });
        }

        const passenger = await findPassengerById(ride.passengerId._id);
        const driver = await findDriverById(ride.driverId._id);

        if (!passenger || !driver) {
          return socket.emit('ride:tip_driver', {
            success: false,
            objectType,
            code: 'NOT_FOUND',
            message: `Driver or Passenger not found`,
          });
        }

        socket.join(`ride:${ride._id}`);

        if (ride.paymentMethod === 'WALLET') {
          const tip = await payDriverFromWallet(
            passenger,
            driver,
            ride,
            amount,
            'TIP',
          );
          if (tip.error) {
            return socket.emit('ride:tip_driver', {
              success: false,
              objectType,
              code: 'PAYMENT_FAILED',
              message: tip.error,
            });
          }

          io.to(`ride:${ride._id}`).emit('ride:tip_driver', {
            success: true,
            objectType,
            data: {
              ride,
              payment: tip.payment,
              transaction: tip.transaction,
            },
            message: 'Tip successfully send to driver',
          });
        }

        if (ride.paymentMethod === 'CARD') {
          const tip = await passengerPaysDriver(
            passenger,
            driver,
            ride,
            amount,
            passenger.defaultCardId,
            'TIP',
          );
          if (!tip.payment || !tip.transaction) {
            return socket.emit('ride:tip_driver', {
              success: false,
              objectType,
              code: 'PAYMENT_FAILED',
              message: `Failed to send tip t driver's account`,
            });
          }

          io.to(`ride:${ride._id}`).emit('ride:tip_driver', {
            success: true,
            objectType,
            data: {
              ride,
              payment: tip.payment,
              transaction: tip.transaction,
            },
            message: 'Tip successfully send to driver',
          });
        }
      } catch (error) {
        console.error(`SOCKET ERROR: ${error}`);
        return socket.emit('error', {
          success: false,
          objectType,
          code: `${error.code || 'SOCKET_ERROR'}`,
          message: `SOCKET ERROR: ${error.message}`,
        });
      }
    });

    socket.on('ride:pay_driver', async ({ rideId }) => {
      const objectType = 'pay-driver';
      try {
        const ride = await findRideById(rideId);
        if (!ride) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'NOT_FOUND',
            message: 'Ride not found',
          });
        } else if (ride.status !== 'RIDE_COMPLETED') {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'INVALID_STATUS',
            message: `Cannot rate driver. Current ride status: ${ride.status}`,
          });
        } else if (!ride.actualFare || ride.actualFare <= 0) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'INVALID_AMOUNT',
            message: `Actual fare must be greter than 0`,
          });
        } else if (ride.paymentStatus === 'COMPLETED') {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'ALLREADY_PAID',
            message: `You have already paid $${ride.actualFare} of fare`,
          });
        }

        const passenger = await findPassengerById(ride.passengerId._id);
        const driver = await findDriverById(ride.driverId._id);

        if (!passenger || !driver) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'NOT_FOUND',
            message: `Driver or Passenger not found`,
          });
        }

        socket.join(`ride:${ride._id}`);
        if (ride.paymentMethod === 'WALLET') {
          const adminCommission = await deductRidenCommission(
            ride.carType,
            ride.actualFare,
            ride.fareBreakdown?.promoDiscount,
            ride._id,
          );

          const fare = await payDriverFromWallet(
            passenger,
            driver,
            ride,
            ride.actualFare - adminCommission,
            ride.actualFare,
            'RIDE',
          );
          if (!fare.success) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'PAYMENT_FAILED',
              message: fare.error,
            });
          } else if (fare.success) {
            await createRideTransaction({
              rideId: ride._id,
              driverId: ride.driverId,
              passengerId: ride.passengerId,
              amount: ride.actualFare,
              commission: adminCommission,
              discount: ride.fareBreakdown?.promoDiscount || 0,
              tip: ride.tipBreakdown?.amount || 0,
              driverEarning: ride.actualFare - adminCommission,
              paymentMethod: ride.paymentMethod,
              status: 'COMPLETED',
              payoutWeek: getPayoutWeek(new Date()),
            });

            await updateRideById(ride._id, {
              paymentStatus: 'COMPLETED',
              driverPaidAt: new Date(),
            });

            const receipt = await generateRideReceipt(ride._id);
            if (!receipt) {
              return socket.emit('error', {
                success: false,
                objectType,
                code: 'RECEIPT_FAILED',
                message: 'Failed to generate the receipt',
              });
            }

            // Notification Logic Start
            const notifyPassenger = await notifyUser({
              userId: ride.passengerId?.userId,
              title: 'Payment Successful!',
              message: `Thanks for riding with RIDEN. Your payment of ${ride.actualAmount} was completed successfully. Receipts are available in your ride history`,
              module: 'payment',
              metadata: ride,
              type: 'ALERT',
              actionLink: `pay_driver`,
              isPush: false,
            });
            if (!notifyPassenger) {
              console.error('Failed to send notification');
            }

            const notifyDriver = await notifyUser({
              userId: ride.driverId?.userId,
              title: 'Payment Done',
              message: `Payment successful! ${fare} has been added to your Riden wallet`,
              module: 'payment',
              metadata: ride,
              type: 'ALERT',
              actionLink: `driver_get_paid`,
            });
            if (!notifyDriver) {
              console.error('Failed to send notification');
            }
            // Notification Logic End

            io.to(`ride:${ride._id}`).emit('ride:pay_driver', {
              success: true,
              objectType,
              data: {
                ride,
                transaction: fare.transaction,
              },
              message: 'Fare successfully paid to driver',
            });
          } else {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'PAYMENT_ERROR',
              message: fare.error || 'something went wrong',
            });
          }
        }

        if (ride.paymentMethod === 'CARD') {
          const adminCommission = await deductRidenCommission(
            ride.carType,
            ride.actualFare,
            ride.fareBreakdown?.promoDiscount,
            ride._id,
          );

          const fare = await passengerPaysDriver(
            passenger,
            driver,
            ride,
            ride.actualFare - adminCommission,
            ride.actualFare,
            passenger.defaultCardId,
            'RIDE',
          );
          if (!fare.success) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'PAYMENT_FAILED',
              message: fare.error,
            });
          } else if (fare.success) {
            await createRideTransaction({
              rideId: ride._id,
              driverId: ride.driverId,
              passengerId: ride.passengerId,
              amount: ride.actualFare,
              commission: adminCommission,
              discount: ride.fareBreakdown?.promoDiscount || 0,
              tip: ride.tipBreakdown?.amount || 0,
              driverEarning: ride.actualFare - adminCommission,
              paymentMethod: ride.paymentMethod,
              status: 'COMPLETED',
              payoutWeek: getPayoutWeek(new Date()),
            });

            await updateRideById(ride._id, {
              paymentStatus: 'COMPLETED',
              driverPaidAt: new Date(),
            });

            const receipt = await generateRideReceipt(ride._id);
            if (!receipt) {
              return socket.emit('error', {
                success: false,
                objectType,
                code: 'RECEIPT_FAILED',
                message: 'Failed to generate the receipt',
              });
            }

            // Notification Logic Start
            const notifyPassenger = await notifyUser({
              userId: ride.passengerId?.userId,
              title: 'Payment Successful!',
              message: `Thanks for riding with RIDEN. Your payment of ${ride.actualAmount} was completed successfully. Receipts are available in your ride history`,
              module: 'payment',
              metadata: ride,
              type: 'ALERT',
              actionLink: `pay_driver`,
              isPush: false,
            });
            if (!notifyPassenger) {
              console.error('Failed to send notification');
            }

            const notifyDriver = await notifyUser({
              userId: ride.driverId?.userId,
              title: 'Payment Done',
              message: `Payment successful! ${fare} has been added to your Riden wallet`,
              module: 'payment',
              metadata: ride,
              type: 'ALERT',
              actionLink: `driver_get_paid`,
            });
            if (!notifyDriver) {
              console.error('Failed to send notification');
            }
            // Notification Logic End

            io.to(`ride:${ride._id}`).emit('ride:pay_driver', {
              success: true,
              objectType,
              data: {
                ride,
                payment: fare.payment,
                transaction: fare.transaction,
              },
              message: 'Driver Paid Successfully',
            });
          } else {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'PAYMENT_ERROR',
              message: fare.error || 'something went wrong',
            });
          }
        }
      } catch (error) {
        console.error(`SOCKET ERROR: ${error}`);
        return socket.emit('error', {
          success: false,
          objectType,
          code: `${error.code || 'SOCKET_ERROR'}`,
          message: `SOCKET ERROR: ${error.message}`,
        });
      }
    });

    // Chat Events
    socket.on('ride:get_chat', async ({ rideId }) => {
      const objectType = 'ride-chat';
      try {
        const ride = await findRideById(rideId);
        if (
          !ride ||
          ![
            'DRIVER_ASSIGNED',
            'DRIVER_ARRIVING',
            'DRIVER_ARRIVED',
            'RIDE_STARTED',
            'RIDE_IN_PROGRESS',
          ].includes(ride.status)
        ) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'INVALID_CHAT',
            message: 'This chat is not eligible',
          });
        }

        let receiver;
        if (['driver'].includes(socket.user.roles)) {
          receiver = await findDriverByUserId(userId);
          if (
            !receiver ||
            receiver.isBlocked ||
            receiver.isSuspended ||
            receiver.backgroundCheckStatus !== 'approved' ||
            !['on_ride'].includes(receiver.status) ||
            ride.driverId.toString() !== receiver._id.toString()
          ) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Forbidden: Driver not eligible',
            });
          }
        } else if (['passenger'].includes(socket.user.roles)) {
          receiver = await findPassengerByUserId(userId);
          if (
            !receiver ||
            receiver.isBlocked ||
            receiver.isSuspended ||
            ride.passengerId.toString() !== receiver._id.toString()
          ) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Forbidden: Passenger not eligible',
            });
          }
        }

        const chat = await findChatRoomByRideId(ride._id);
        if (!chat) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FETCH_FAILED',
            message: 'Failed to fetch chat',
          });
        }

        socket.emit('ride:get_chat', {
          success: true,
          objectType,
          data: chat,
          message: 'Chat fetched successfully',
        });
      } catch (error) {
        console.error(`SOCKET ERROR: ${error}`);
        return socket.emit('error', {
          success: false,
          objectType,
          code: `${error.code || 'SOCKET_ERROR'}`,
          message: `SOCKET ERROR: ${error.message}`,
        });
      }
    });

    socket.on(
      'ride:send_message',
      async ({ rideId, text, messageType = 'text', attachments }) => {
        const objectType = 'ride-send-message';

        try {
          let sender;
          let role;
          if (socket.user.roles.includes('driver')) {
            sender = await findDriverByUserId(userId);
            role = 'driver';

            if (
              !sender ||
              sender.isBlocked ||
              sender.isSuspended ||
              sender.backgroundCheckStatus !== 'approved' ||
              !['online', 'on_ride'].includes(sender.status)
            ) {
              return socket.emit('error', {
                success: false,
                objectType,
                code: 'FORBIDDEN',
                message: 'Forbidden: Driver not eligible',
              });
            }
          } else if (socket.user.roles.includes('passenger')) {
            sender = await findPassengerByUserId(userId);
            role = 'passenger';

            if (!sender || sender.isBlocked || sender.isSuspended) {
              return socket.emit('error', {
                success: false,
                objectType,
                code: 'FORBIDDEN',
                message: 'Forbidden: Passenger not eligible',
              });
            }
          }

          const ride = await findRideById(rideId);
          if (!ride) {
            return socket.emit('error', {
              success: false,
              message: 'Ride not found',
            });
          } else if (!text || text.trim().length === 0) {
            return socket.emit('error', {
              success: false,
              message: 'Empty message is not allowed',
            });
          } else if (
            !['text', 'system', 'location', 'image'].includes(messageType)
          ) {
            return socket.emit('error', {
              success: false,
              message: 'Invalid message type',
            });
          }

          const chat = await findChatRoomByRideId(ride._id);
          if (!chat) {
            return socket.emit('error', {
              success: false,
              message: 'Chat not found',
            });
          }

          const newMsg = await createMessage({
            rideId: ride._id,
            senderId: sender.userId,
            chatRoomId: chat._id,
            text,
            messageType,
            attachments,
          });

          const payload = { $push: { messages: { messageId: newMsg._id } } };

          const updatedChat = await updateChatById(chat._id, payload);
          if (!updatedChat) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'MESSAGE_FAILED',
              message: 'Failed to send message',
            });
          }

          // Notification Logic Start
          const notify = await notifyUser({
            userId:
              role === 'driver'
                ? ride.passengerId?.userId
                : ride.driverId?.userId,
            title:
              role === 'driver' ? 'Your Driver Wants to Chat' : 'New Message',
            message:
              role === 'driver'
                ? `Your driver has sent you a message. Open the chat to respond quickly.`
                : `Your Passenger just sent you a message.`,
            module: 'chat',
            metadata: updatedChat,
            type: 'ALERT',
            actionLink: `new_message`,
            storeInDB: false,
          });
          if (!notify) {
            console.error('Failed to send notification');
          }
          // Notification Logic End

          socket.join(`ride:${rideId}`);
          io.to(`ride:${rideId}`).emit('ride:send_message', {
            success: true,
            objectType,
            data: updatedChat,
            message: `${socket.user.roles[0]} send you a message`,
          });
        } catch (error) {
          console.error(`SOCKET ERROR: ${error}`);
          return socket.emit('error', {
            success: false,
            objectType,
            code: `${error.code || 'SOCKET_ERROR'}`,
            message: `SOCKET ERROR: ${error.message}`,
          });
        }
      },
    );

    socket.on('ride:read_messages', async ({ rideId }) => {
      const objectType = 'read-message';
      try {
        let reader;
        if (socket.user.roles.includes('driver')) {
          reader = await findDriverByUserId(userId);

          if (
            !reader ||
            reader.isBlocked ||
            reader.isSuspended ||
            reader.backgroundCheckStatus !== 'approved' ||
            !['online', 'on_ride'].includes(reader.status)
          ) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Forbidden: Driver not eligible',
            });
          }
        } else if (socket.user.roles.includes('passenger')) {
          reader = await findPassengerByUserId(userId);

          if (!reader || reader.isBlocked || reader.isSuspended) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Forbidden: Passenger not eligible',
            });
          }
        }

        const isRead = await markAllRideMessagesAsRead(rideId, reader.userId);
        if (!isRead.modifiedCount && isRead.modifiedCount < 0) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FAILED_TO_READ',
            message: `Failed to mark messages as read`,
          });
        }

        socket.join(`ride:${rideId}`);
        io.to(`ride:${rideId}`).emit('ride:read_messages', {
          success: true,
          objectType,
          data: isRead,
          message: `${isRead} message(s) successfully marked as read by ${socket.user.roles[0]}`,
        });
      } catch (error) {
        console.error(`SOCKET ERROR: ${error}`);
        return socket.emit('error', {
          success: false,
          objectType,
          code: `${error.code || 'SOCKET_ERROR'}`,
          message: `SOCKET ERROR: ${error.message}`,
        });
      }
    });

    socket.on('ride:edit_message', async ({ messageId, text }) => {
      const objectType = 'edit-message';
      try {
        let sender;
        if (socket.user.roles.includes('driver')) {
          sender = await findDriverByUserId(userId);

          if (
            !sender ||
            sender.isBlocked ||
            sender.isSuspended ||
            sender.backgroundCheckStatus !== 'approved' ||
            !['online', 'on_ride'].includes(sender.status)
          ) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Forbidden: Driver not eligible',
            });
          }
        } else if (socket.user.roles.includes('passenger')) {
          sender = await findPassengerByUserId(userId);

          if (!sender || sender.isBlocked || sender.isSuspended) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Forbidden: Passenger not eligible',
            });
          }
        }

        const updatedMsg = await editMessage(messageId, sender.userId, text);
        if (!updatedMsg) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'EDIT_FAILED',
            message: 'Failed to edit message',
          });
        }

        socket.emit('ride:edit_message', {
          success: true,
          objectType,
          data: updatedMsg,
          message: 'Message edited successfully',
        });
      } catch (error) {
        console.error(`SOCKET ERROR: ${error}`);
        return socket.emit('error', {
          success: false,
          objectType,
          code: `${error.code || 'SOCKET_ERROR'}`,
          message: `SOCKET ERROR: ${error.message}`,
        });
      }
    });

    socket.on(
      'ride:reply_message',
      async ({
        rideId,
        text,
        messageType = 'text',
        attachments,
        messageId,
      }) => {
        const objectType = 'reply-message';
        try {
          let sender;
          if (socket.user.roles.includes('driver')) {
            sender = await findDriverByUserId(userId);

            if (
              !sender ||
              sender.isBlocked ||
              sender.isSuspended ||
              sender.backgroundCheckStatus !== 'approved' ||
              !['online', 'on_ride'].includes(sender.status)
            ) {
              return socket.emit('error', {
                success: false,
                objectType,
                code: 'FORBIDDEN',
                message: 'Forbidden: Driver not eligible',
              });
            }
          } else if (socket.user.roles.includes('passenger')) {
            sender = await findPassengerByUserId(userId);

            if (!sender || sender.isBlocked || sender.isSuspended) {
              return socket.emit('error', {
                success: false,
                objectType,
                code: 'FORBIDDEN',
                message: 'Forbidden: Passenger not eligible',
              });
            }
          }

          if (!rideId) {
            socket.emit('error', {
              success: false,
              objectType,
              code: 'INVALID_RIDE',
              message: 'Ride Id is required',
            });
          } else if (!text || text.trim().length === 0) {
            socket.emit('error', {
              success: false,
              objectType,
              code: 'INVALID_TEXT',
              message: 'Empty message is not allowed',
            });
          } else if (
            !['text', 'system', 'location', 'image'].includes(messageType)
          ) {
            socket.emit('error', {
              success: false,
              objectType,
              code: 'INVALID_TYPE',
              message: 'Invalid message type',
            });
          }

          const msg = await findMessageById(messageId);
          if (!msg) {
            socket.emit('error', {
              success: false,
              objectType,
              code: 'NOT_FOUND',
              message: 'Message not found',
            });
          }

          const chat = await findChatRoomByRideId(rideId);
          if (!chat) {
            socket.emit('error', {
              success: false,
              objectType,
              code: 'MESSAGE_FAILED',
              message: 'Chat not found',
            });
          }

          const newMsg = await createMessage({
            rideId,
            senderId: sender.userId,
            chatRoomId: chat._id,
            text,
            messageType,
            attachments,
            replyTo: messageId,
          });

          const payload = { $push: { messages: { messageId: newMsg._id } } };

          const updatedChat = await updateChatById(chat._id, payload);
          if (!updatedChat) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'MESSAGE_FAILED',
              message: 'Failed to send message',
            });
          }

          socket.join(`ride:${rideId}`);
          io.to(`ride:${rideId}`).emit('ride:reply_message', {
            success: true,
            objectType,
            data: updatedChat,
            message: `${socket.user.roles[0]} replied to you`,
          });
        } catch (error) {
          console.error(`SOCKET ERROR: ${error}`);
          return socket.emit('error', {
            success: false,
            objectType,
            code: `${error.code || 'SOCKET_ERROR'}`,
            message: `SOCKET ERROR: ${error.message}`,
          });
        }
      },
    );

    socket.on('ride:delete_message', async ({ messageId }) => {
      const objectType = 'delete-message';
      try {
        let sender;
        if (socket.user.roles.includes('driver')) {
          sender = await findDriverByUserId(userId);

          if (
            !sender ||
            sender.isBlocked ||
            sender.isSuspended ||
            sender.backgroundCheckStatus !== 'approved' ||
            !['online', 'on_ride'].includes(sender.status)
          ) {
            return socket.emit('ride:delete_message', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Forbidden: Driver not eligible',
            });
          }
        } else if (socket.user.roles.includes('passenger')) {
          sender = await findPassengerByUserId(userId);

          if (!sender || sender.isBlocked || sender.isSuspended) {
            return socket.emit('ride:delete_message', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Forbidden: Passenger not eligible',
            });
          }
        }

        const deletedMsg = await deleteMessage(messageId, sender.userId);
        if (!deletedMsg.acknowledged) {
          return socket.emit('ride:delete_message', {
            success: false,
            objectType,
            code: 'DELETE_FAILED',
            message: 'Failed to delete message',
          });
        }

        socket.emit('ride:delete_message', {
          success: true,
          objectType,
          data: deletedMsg,
          message: 'Message deleted successfully',
        });
      } catch (error) {
        console.error(`SOCKET ERROR: ${error}`);
        return socket.emit('error', {
          success: false,
          objectType,
          code: `${error.code || 'SOCKET_ERROR'}`,
          message: `SOCKET ERROR: ${error.message}`,
        });
      }
    });

    // Call Events
    socket.on(
      'ride:start_call',
      async ({ rideId, callType = 'audio', metadata = {} }) => {
        const objectType = 'start-call';
        try {
          let caller;
          let role;
          if (socket.user.roles.includes('driver')) {
            caller = await findDriverByUserId(userId);
            role = 'driver';

            if (
              !caller ||
              caller.isBlocked ||
              caller.isSuspended ||
              caller.backgroundCheckStatus !== 'approved' ||
              !['online', 'on_ride'].includes(caller.status)
            ) {
              return socket.emit('error', {
                success: false,
                objectType,
                code: 'FORBIDDEN',
                message: 'Forbidden: Driver not eligible',
              });
            }
          } else if (socket.user.roles.includes('passenger')) {
            caller = await findPassengerByUserId(userId);
            role = 'passenger';

            if (!caller || caller.isBlocked || caller.isSuspended) {
              return socket.emit('error', {
                success: false,
                objectType,
                code: 'FORBIDDEN',
                message: 'Forbidden: Passenger not eligible',
              });
            }
          }

          const ride = await findRideById(rideId);
          if (
            !ride ||
            ![
              'DRIVER_ASSIGNED',
              'DRIVER_ARRIVING',
              'DRIVER_ARRIVED',
              'RIDE_STARTED',
              'RIDE_IN_PROGRESS',
              'RIDE_COMPLETED',
            ].includes(ride.status) ||
            !['PENDING', 'PROCESSING'].includes(ride.paymentStatus)
          ) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'INVALID_CALL',
              message: 'This call is not eligible',
            });
          }

          if (
            String(ride.passengerId?._id) !== String(caller._id) &&
            String(ride.driverId?._id) !== String(caller._id)
          ) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: `INVALID_USER`,
              message: `You are not allowed to start the call`,
            });
          }

          const receiverId =
            role === 'driver'
              ? ride.passengerId?.userId
              : ride.driverId?.userId;

          const channelName = `call_${rideId}`;

          // generate agora token (short lived)
          const { token: rtcToken, expiresAt } = generateAgoraToken({
            channelName,
            uid: 0,
            role: 'publisher',
            expireSeconds: 60 * 10, // 10 min
          });

          // persist initial call log
          const callLog = await createCallLog({
            callerId: caller.userId,
            receiverId,
            rideId,
            channelName,
            rtcToken,
            callType,
            status: 'ringing',
            metadata,
          });

          // try to find receiver socket ids
          const receiverSockets = await getSocketIds(receiverId);
          const dataForReceiver = {
            callerId: caller.userId,
            channelName,
            callType,
            rtcToken,
            callLogId: callLog._id.toString(),
            startedAt: new Date(),
            metadata,
          };

          if (receiverSockets.length > 0) {
            // receiver is online — notify all their sockets
            receiverSockets.forEach((sid) =>
              io.to(sid).emit('ride:start_call', {
                success: true,
                objectType,
                data: dataForReceiver,
                message: `${caller._id} is calling you`,
              }),
            );

            const notify = await notifyUser({
              userId: receiverId,
              title: 'Incoming Call 📞',
              message: `Incoming call from your ${role} — tap to answer!`,
              module: 'call',
              type: 'ALERT',
              metadata: callLog,
              actionLink: 'call_started',
              storeInDB: false,
            });
            if (!notify) {
              socket.emit('error', {
                success: false,
                objectType,
                code: 'NOTIFICATION_FAILED',
                message: 'Failed to send notification',
              });
            }

            socket.emit('ride:start_call', {
              success: true,
              objectType,
              data: callLog,
              message: 'Call initiated successfully',
            });
          } else {
            const notify = await notifyUser({
              userId: receiverId,
              title: 'Incoming Call 📞',
              message: `Incoming call from your ${role} — tap to answer!`,
              module: 'call',
              type: 'ALERT',
              metadata: callLog,
              actionLink: 'call_started',
              storeInDB: false,
            });
            if (!notify) {
              socket.emit('error', {
                success: false,
                objectType,
                code: 'NOTIFICATION_FAILED',
                message: 'Failed to send notification',
              });
            }

            socket.emit('ride:start_call', {
              success: true,
              objectType,
              data: callLog,
              message: 'Call notification sent successfully',
            });
          }
        } catch (error) {
          console.error(`SOCKET ERROR: ${error}`);
          return socket.emit('error', {
            success: false,
            objectType,
            code: `${error.code || 'SOCKET_ERROR'}`,
            message: `SOCKET ERROR: ${error.message}`,
          });
        }
      },
    );

    socket.on('ride:accept_call', async ({ callLogId }) => {
      const objectType = 'accept-ride';
      try {
        let receiver;
        let role;
        if (socket.user.roles.includes('driver')) {
          receiver = await findDriverByUserId(userId);
          role = 'driver';

          if (
            !receiver ||
            receiver.isBlocked ||
            receiver.isSuspended ||
            receiver.backgroundCheckStatus !== 'approved' ||
            !['online', 'on_ride'].includes(receiver.status)
          ) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Forbidden: Driver not eligible',
            });
          }
        } else if (socket.user.roles.includes('passenger')) {
          receiver = await findPassengerByUserId(userId);
          role = 'passenger';

          if (!receiver || receiver.isBlocked || receiver.isSuspended) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Forbidden: Passenger not eligible',
            });
          }
        }

        const call = await findCallById(callLogId);
        if (!call) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: `NOT_FOUND`,
            message: `Call not found`,
          });
        }

        if (call.receiverId.toString() !== receiver.userId.toString()) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: `INVALID_USER`,
            message: `You are not allowed to receive the call`,
          });
        }

        const ride = await findRideById(call.rideId);
        if (
          !ride ||
          ![
            'DRIVER_ASSIGNED',
            'DRIVER_ARRIVING',
            'DRIVER_ARRIVED',
            'RIDE_STARTED',
            'RIDE_IN_PROGRESS',
            'RIDE_COMPLETED',
          ].includes(ride.status) ||
          !['PENDING', 'PROCESSING'].includes(ride.paymentStatus)
        ) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'INVALID_CALL',
            message: 'This call is not eligible',
          });
        }

        const updateCall = await updateCallLogById(callLogId, {
          status: 'accepted',
          startedAt: new Date(),
        });
        if (!updateCall) {
          socket.emit('ride:decline_call', {
            success: false,
            objectType,
            code: 'FAILED_UPDATE',
            message: `Failed to update the call log`,
          });
        }

        // notify caller
        const callerSockets = await getSocketIds(call.callerId);
        callerSockets.forEach((sid) =>
          io.to(sid).emit('ride:accept_call', {
            success: true,
            objectType,
            data: updateCall,
            message: `Call successfully accepted by ${role}`,
          }),
        );

        socket.emit('ride:accept_call', {
          success: true,
          objectType,
          data: updateCall,
          message: `Call Accepted successfully`,
        });
      } catch (error) {
        console.error(`SOCKET ERROR: ${error}`);
        return socket.emit('error', {
          success: false,
          objectType,
          code: `${error.code || 'SOCKET_ERROR'}`,
          message: `SOCKET ERROR: ${error.message}`,
        });
      }
    });

    socket.on('ride:decline_call', async ({ callLogId }) => {
      const objectType = 'decline-call';
      try {
        let receiver;
        let role;
        if (socket.user.roles.includes('driver')) {
          receiver = await findDriverByUserId(userId);
          role = 'driver';

          if (
            !receiver ||
            receiver.isBlocked ||
            receiver.isSuspended ||
            receiver.backgroundCheckStatus !== 'approved' ||
            !['online', 'on_ride'].includes(receiver.status)
          ) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Forbidden: Driver not eligible',
            });
          }
        } else if (socket.user.roles.includes('passenger')) {
          receiver = await findPassengerByUserId(userId);
          role = 'passenger';

          if (!receiver || receiver.isBlocked || receiver.isSuspended) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Forbidden: Passenger not eligible',
            });
          }
        }

        const call = await findCallById(callLogId);
        if (!call) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: `NOT_FOUND`,
            message: `Call not found`,
          });
        }

        if (call.receiverId.toString() !== receiver.userId.toString()) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: `INVALID_USER`,
            message: `You are not allowed to receive the call`,
          });
        }

        const ride = await findRideById(call.rideId);
        if (
          !ride ||
          ![
            'DRIVER_ASSIGNED',
            'DRIVER_ARRIVING',
            'DRIVER_ARRIVED',
            'RIDE_STARTED',
            'RIDE_IN_PROGRESS',
            'RIDE_COMPLETED',
          ].includes(ride.status) ||
          !['PENDING', 'PROCESSING'].includes(ride.paymentStatus)
        ) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'INVALID_CALL',
            message: 'This call is not eligible',
          });
        }

        const updatedCall = await updateCallLogById(callLogId, {
          status: 'declined',
          endedAt: new Date(),
        });
        if (!updatedCall) {
          socket.emit('error', {
            success: false,
            objectType,
            code: 'FAILED_UPDATE',
            message: `Failed to update the call log`,
          });
        }

        const callerSockets = await getSocketIds(call.callerId);
        callerSockets.forEach((sid) =>
          io.to(sid).emit('ride:decline_call', {
            success: true,
            objectType,
            data: updatedCall,
            message: `Called declined by ${role}`,
          }),
        );

        const notify = await notifyUser({
          userId: call.callerId,
          title: 'Call Declined',
          message: `The call was declined by ${role}`,
          module: 'call',
          type: 'ALERT',
          metadata: updatedCall,
        });
        if (!notify) {
          socket.emit('error', {
            success: false,
            objectType,
            code: 'NOTIFICATION_FAILED',
            message: 'Failed to send notification',
          });
        }

        socket.emit('ride:decline_call', {
          success: true,
          objectType,
          data: updatedCall,
          message: `Call declined successfully`,
        });
      } catch (error) {
        console.error(`SOCKET ERROR: ${error}`);
        return socket.emit('error', {
          success: false,
          objectType,
          code: `${error.code || 'SOCKET_ERROR'}`,
          message: `SOCKET ERROR: ${error.message}`,
        });
      }
    });

    socket.on('ride:cancel_call', async ({ callLogId }) => {
      const objectType = 'cancel-call';
      try {
        let caller;
        let role;
        if (socket.user.roles.includes('driver')) {
          caller = await findDriverByUserId(userId);
          role = 'driver';

          if (
            !caller ||
            caller.isBlocked ||
            caller.isSuspended ||
            caller.backgroundCheckStatus !== 'approved' ||
            !['online', 'on_ride'].includes(caller.status)
          ) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Forbidden: Driver not eligible',
            });
          }
        } else if (socket.user.roles.includes('passenger')) {
          caller = await findPassengerByUserId(userId);
          role = 'passenger';

          if (!caller || caller.isBlocked || caller.isSuspended) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Forbidden: Passenger not eligible',
            });
          }
        }

        const call = await findCallById(callLogId);
        if (!call) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: `NOT_FOUND`,
            message: `Call not found`,
          });
        }

        if (call.callerId.toString() !== caller.userId.toString()) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: `INVALID_USER`,
            message: `You are not allowed to receive the call`,
          });
        }

        const ride = await findRideById(call.rideId);
        if (
          !ride ||
          ![
            'DRIVER_ASSIGNED',
            'DRIVER_ARRIVING',
            'DRIVER_ARRIVED',
            'RIDE_STARTED',
            'RIDE_IN_PROGRESS',
            'RIDE_COMPLETED',
          ].includes(ride.status) ||
          !['PENDING', 'PROCESSING'].includes(ride.paymentStatus)
        ) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'INVALID_CALL',
            message: 'This call is not eligible',
          });
        }

        const updatedCall = await updateCallLogById(callLogId, {
          status: 'cancelled',
          endedAt: new Date(),
        });
        if (!updatedCall) {
          socket.emit('error', {
            success: false,
            objectType,
            code: 'FAILED_UPDATE',
            message: `Failed to update the call log`,
          });
        }

        const receiverSockets = await getSocketIds(call.receiverId);
        receiverSockets.forEach((sid) =>
          io.to(sid).emit('ride:cancel_call', {
            success: true,
            objectType,
            data: updatedCall,
            message: `You missed a call from ${role}`,
          }),
        );

        const notify = await notifyUser({
          userId: call.receiverId,
          title: 'Missed Call',
          message: `You missed a call from ${role}`,
          module: 'call',
          type: 'ALERT',
          metadata: updatedCall,
        });
        if (!notify) {
          socket.emit('error', {
            success: false,
            objectType,
            code: 'NOTIFICATION_FAILED',
            message: 'Failed to send notification',
          });
        }

        socket.emit('ride:cancel_call', {
          success: true,
          objectType,
          data: updatedCall,
          message: `You cancelled the call`,
        });
      } catch (error) {
        console.error(`SOCKET ERROR: ${error}`);
        return socket.emit('error', {
          success: false,
          objectType,
          code: `${error.code || 'SOCKET_ERROR'}`,
          message: `SOCKET ERROR: ${error.message}`,
        });
      }
    });

    socket.on('ride:end_call', async ({ callLogId }) => {
      const objectType = 'end-call';
      try {
        let member;
        let role;
        if (socket.user.roles.includes('driver')) {
          member = await findDriverByUserId(userId);
          role = 'driver';

          if (
            !member ||
            member.isBlocked ||
            member.isSuspended ||
            member.backgroundCheckStatus !== 'approved' ||
            !['online', 'on_ride'].includes(member.status)
          ) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Forbidden: Driver not eligible',
            });
          }
        } else if (socket.user.roles.includes('passenger')) {
          member = await findPassengerByUserId(userId);
          role = 'passenger';

          if (!member || member.isBlocked || member.isSuspended) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Forbidden: Passenger not eligible',
            });
          }
        }

        const call = await findCallById(callLogId);
        if (!call) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: `NOT_FOUND`,
            message: `Call not found`,
          });
        }

        if (
          call.callerId.toString() !== member.userId.toString() &&
          call.receiverId.toString() !== member.userId.toString()
        ) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: `INVALID_USER`,
            message: `You are not allowed to receive the call`,
          });
        }

        const ride = await findRideById(call.rideId);
        if (
          !ride ||
          ![
            'DRIVER_ASSIGNED',
            'DRIVER_ARRIVING',
            'DRIVER_ARRIVED',
            'RIDE_STARTED',
            'RIDE_IN_PROGRESS',
            'RIDE_COMPLETED',
          ].includes(ride.status) ||
          !['PENDING', 'PROCESSING'].includes(ride.paymentStatus)
        ) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'INVALID_CALL',
            message: 'This call is not eligible',
          });
        }

        const updatedCall = await updateCallLogById(callLogId, {
          status: 'ended',
          endedAt: new Date(),
        });
        if (!updatedCall) {
          socket.emit('error', {
            success: false,
            objectType,
            code: 'FAILED_UPDATE',
            message: `Failed to update the call log`,
          });
        }

        const otherUser =
          String(member.userId) === String(call.callerId)
            ? call.receiverId
            : call.callerId;

        // notify other user(s)
        const otherSockets = await getSocketIds(otherUser);
        otherSockets.forEach((sid) =>
          io.to(sid).emit('ride:end_call', {
            success: true,
            objectType,
            data: updatedCall,
            message: `Call successfully ended by ${role}`,
          }),
        );

        socket.emit('ride:end_call', {
          success: true,
          objectType,
          data: updatedCall,
          message: `You ended the call`,
        });
        socket.leave(call.channelName);
      } catch (error) {
        console.error(`SOCKET ERROR: ${error}`);
        return socket.emit('error', {
          success: false,
          objectType,
          code: `${error.code || 'SOCKET_ERROR'}`,
          message: `SOCKET ERROR: ${error.message}`,
        });
      }
    });

    socket.on('ride:join_call', async ({ callLogId }) => {
      const objectType = 'join-call';
      try {
        let member;
        let role;
        if (socket.user.roles.includes('driver')) {
          member = await findDriverByUserId(userId);
          role = 'driver';

          if (
            !member ||
            member.isBlocked ||
            member.isSuspended ||
            member.backgroundCheckStatus !== 'approved' ||
            !['online', 'on_ride'].includes(member.status)
          ) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Forbidden: Driver not eligible',
            });
          }
        } else if (socket.user.roles.includes('passenger')) {
          member = await findPassengerByUserId(userId);
          role = 'passenger';

          if (!member || member.isBlocked || member.isSuspended) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Forbidden: Passenger not eligible',
            });
          }
        }

        const call = await findCallById(callLogId);
        if (!call) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: `NOT_FOUND`,
            message: `Call not found`,
          });
        } else if (call.endedAt) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: `CALL_ENDED`,
            message: `This call is ended`,
          });
        }

        const ride = await findRideById(call.rideId);
        if (
          !ride ||
          ![
            'DRIVER_ASSIGNED',
            'DRIVER_ARRIVING',
            'DRIVER_ARRIVED',
            'RIDE_STARTED',
            'RIDE_IN_PROGRESS',
            'RIDE_COMPLETED',
          ].includes(ride.status) ||
          !['PENDING', 'PROCESSING'].includes(ride.paymentStatus)
        ) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'INVALID_CALL',
            message: 'This call is not eligible',
          });
        }

        if (
          ride.driverId.toString() !== member._id &&
          call.passengerId.toString() !== member._id.toString()
        ) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: `INVALID_USER`,
            message: `You are not allowed to receive the call`,
          });
        }

        socket.join(call.channelName);
        io.to(call.channelName).emit('ride:join_call', {
          success: true,
          objectType,
          data: call,
          message: `${role} joind the call`,
        });
      } catch (error) {
        console.error(`SOCKET ERROR: ${error}`);
        return socket.emit('error', {
          success: false,
          objectType,
          code: `${error.code || 'SOCKET_ERROR'}`,
          message: `SOCKET ERROR: ${error.message}`,
        });
      }
    });

    socket.on('ride:leave_call', async ({ callLogId }) => {
      const objectType = 'leave-call';
      try {
        let member;
        let role;
        if (socket.user.roles.includes('driver')) {
          member = await findDriverByUserId(userId);
          role = 'driver';

          if (
            !member ||
            member.isBlocked ||
            member.isSuspended ||
            member.backgroundCheckStatus !== 'approved' ||
            !['online', 'on_ride'].includes(member.status)
          ) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Forbidden: Driver not eligible',
            });
          }
        } else if (socket.user.roles.includes('passenger')) {
          member = await findPassengerByUserId(userId);
          role = 'passenger';

          if (!member || member.isBlocked || member.isSuspended) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Forbidden: Passenger not eligible',
            });
          }
        }

        const call = await findCallById(callLogId);
        if (!call) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: `NOT_FOUND`,
            message: `Call not found`,
          });
        }

        const ride = await findRideById(call.rideId);
        if (
          !ride ||
          ![
            'DRIVER_ASSIGNED',
            'DRIVER_ARRIVING',
            'DRIVER_ARRIVED',
            'RIDE_STARTED',
            'RIDE_IN_PROGRESS',
            'RIDE_COMPLETED',
          ].includes(ride.status) ||
          !['PENDING', 'PROCESSING'].includes(ride.paymentStatus)
        ) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'INVALID_CALL',
            message: 'This call is not eligible',
          });
        }

        if (
          ride.driverId.toString() !== member._id.toString() &&
          call.passengerId.toString() !== member._id.toString()
        ) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: `INVALID_USER`,
            message: `You are not allowed to receive the call`,
          });
        }

        socket.leave(call.channelName);
        io.to(call.channelName).emit('ride:leave_call', {
          success: true,
          objectType,
          data: call,
          message: `${role} left the call`,
        });
      } catch (error) {
        console.error(`SOCKET ERROR: ${error}`);
        return socket.emit('error', {
          success: false,
          objectType,
          code: `${error.code || 'SOCKET_ERROR'}`,
          message: `SOCKET ERROR: ${error.message}`,
        });
      }
    });

    // Admin Events
    socket.on('admin:dashboard', async () => {
      const objectType = 'get-dashboard-data';
      try {
        const data = await findDashboardData();
        if (!data) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'NOT_FOUND',
            message: 'Failed to fetch rides data',
          });
        }

        socket.emit('admin:dashboard', {
          success: true,
          objectType,
          data,
          message: 'Ongoing rides data fetched successfully',
        });
      } catch (error) {
        console.error(`SOCKET ERROR: ${error}`);
        return socket.emit('error', {
          success: false,
          objectType,
          code: `${error.code || 'SOCKET_ERROR'}`,
          message: `SOCKET ERROR: ${error.message}`,
        });
      }
    });

    socket.on('disconnect', async (reason) => {
      await removeSocket(userId, socket.id).catch(console.error);
      console.log(`🔌 User ${userId} disconnected: ${reason}`);
    });

    // Error handling
    socket.on('error', (error) => {
      console.error('Socket error:', error);
      socket.emit('error', { message: 'Socket connection error' });
    });
  });

  ioInstance = io;
  console.log('🚀 Socket.IO server initialized');
  return io;
};

export const getIO = () => {
  if (!ioInstance) {
    console.warn('Socket.IO instance not initialized');
  }
  return ioInstance;
};

// Helper function to emit to specific ride
export const emitToRide = (rideId, event, data) => {
  if (ioInstance) {
    ioInstance.to(`ride:${rideId}`).emit(event, data);
  }
};

// Helper function to emit to specific user
export const emitToUser = (userId, event, data) => {
  if (ioInstance) {
    ioInstance.to(`user:${userId}`).emit(event, data);
  }
};
