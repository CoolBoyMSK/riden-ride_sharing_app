import { Server } from 'socket.io';
import env from '../config/envConfig.js';
import { verifyAccessToken } from '../utils/auth.js';
import { createMessage, markMessageRead } from '../dal/chat.js';
import {
  findRideByRideId,
  findDriverLocation,
  findPendingRides,
  updateRideById,
  findRideById,
  saveDriverLocation,
  getDriverLocation,
  persistDriverLocationToDB,
  updateDriverAvailability,
  findNearbyRideRequests,
} from '../dal/ride.js';
import {
  findDriverByUserId,
  updateDriverByUserId,
  findAllDestination,
} from '../dal/driver.js';
import {
  findPassengerByUserId,
  updatePassengerById,
} from '../dal/passenger.js';
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

    // Join user's personal room for direct notifications
    socket.join(`user:${userId}`);

    // Driver Events
    socket.on('ride:find', async () => {
      const objectType = 'find-ride';
      const session = await mongoose.startSession();
      try {
        await session.startTransaction();

        const driver = await findDriverByUserId(userId, { session });
        if (
          !driver ||
          driver.isBlocked ||
          driver.isSuspended ||
          driver.backgroundCheckStatus !== 'approved' ||
          driver.status !== 'online'
        ) {
          await session.abortTransaction();
          session.endSession();
          return socket.emit('response', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Forbidden: Driver not eligible',
          });
        }

        const driverLocation = await findDriverLocation(driver._id, {
          session,
        });
        if (!driverLocation || !driverLocation.isAvailable) {
          await session.abortTransaction();
          session.endSession();
          return socket.emit('response', {
            success: false,
            objectType,
            code: 'LOCATION_UNAVAILABLE',
            message: 'Driver location unavailable or not marked as available',
          });
        }

        const availableRides = await findPendingRides(
          driver.vehicle.type,
          driverLocation.location.coordinates,
          10000,
          { limit: 10, session },
        );

        // Commit transaction since all reads succeeded
        await session.commitTransaction();
        session.endSession();

        if (!availableRides.length) {
          return socket.emit('response', {
            success: true,
            objectType,
            rides: [],
            message: 'No available rides found nearby',
          });
        }

        socket.emit('response', {
          success: true,
          objectType,
          rides: availableRides,
          message: `${availableRides.length} available rides found`,
        });
      } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error(`SOCKET ERROR: ${error}`);
        return socket.emit('error', {
          success: false,
          objectType,
          code: error.code || 'SOCKET_ERROR',
          message: `SOCKET ERROR: ${error.message}`,
        });
      }
    });

    socket.on('ride:decline_ride', async ({ rideId }) => {
      const objectType = 'decline-ride';
      const session = await mongoose.startSession();

      try {
        await session.withTransaction(async () => {
          const driver = await findDriverByUserId(userId, { session });
          if (
            !driver ||
            driver.isBlocked ||
            driver.isSuspended ||
            driver.backgroundCheckStatus !== 'approved' ||
            driver.status !== 'online'
          ) {
            return socket.emit('response', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Forbidden: Driver not eligible',
            });
          }

          const driverLocation = await findDriverLocation(driver._id, {
            session,
          });
          if (!driverLocation || !driverLocation.isAvailable) {
            return socket.emit('response', {
              success: false,
              objectType,
              code: 'LOCATION_UNAVAILABLE',
              message: 'Driver location unavailable or not marked as available',
            });
          }

          const ride = await findRideById(rideId, { session });
          if (!ride) {
            return socket.emit('response', {
              success: false,
              objectType,
              code: 'NOT_FOUND',
              message: 'Ride not found',
            });
          }

          if (ride.driverId?.toString() === driver._id.toString()) {
            return socket.emit('response', {
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
            { excludeIds: [rideId], limit: 10, session },
          );

          socket.emit('response', {
            success: true,
            objectType,
            rides: replacementRides,
            message: 'Ride declined successfully',
          });
        });
      } catch (error) {
        console.error(`SOCKET ERROR: ${error}`);
        socket.emit('error', {
          success: false,
          objectType,
          code: `${error.code || 'SOCKET_ERROR'}`,
          message: `SOCKET ERROR: ${error.message}`,
        });
      } finally {
        session.endSession();
      }
    });

    socket.on('ride:accept_ride', async ({ rideId }) => {
      const objectType = 'accept-ride';
      const session = await mongoose.startSession();

      try {
        await session.withTransaction(async () => {
          const driver = await findDriverByUserId(userId, { session });
          if (
            !driver ||
            driver.isBlocked ||
            driver.isSuspended ||
            driver.backgroundCheckStatus !== 'approved' ||
            driver.status !== 'online'
          ) {
            return socket.emit('response', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Forbidden: Driver not eligible',
            });
          }

          const ride = await findRideById(rideId, { session });
          if (!ride) {
            return socket.emit('response', {
              success: false,
              objectType,
              code: 'NOT_FOUND',
              message: 'Ride not found',
            });
          } else if (ride.driverId) {
            return socket.emit('response', {
              success: false,
              objectType,
              code: 'ALREADY_ASSIGNED',
              message: 'Ride already assigned to another driver',
            });
          }

          const availability = await findDriverLocation(driver._id, {
            session,
          });
          if (
            !availability ||
            availability.isAvailable === false ||
            availability.currentRideId
          ) {
            return socket.emit('response', {
              success: false,
              objectType,
              code: 'NOT_AVAILABLE',
              message: 'You are not available to accept the ride',
            });
          }

          const updatedRide = await updateRideById(
            ride._id,
            {
              status: 'DRIVER_ASSIGNED',
              driverId: driver._id,
              driverAssignedAt: new Date(),
            },
            { session },
          );
          if (!updatedRide) {
            return socket.emit('response', {
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
            { session },
          );

          const updatedDriver = await updateDriverByUserId(
            userId,
            { status: 'on_ride' },
            { session },
          );

          if (!updatedDriver || !updateAvailability) {
            // Rollback ride update inside the transaction
            await updateRideById(
              ride._id,
              { driverId: null, status: 'REQUESTED' },
              { session },
            );
            await updateDriverAvailability(driver._id, true, null, { session });
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'DRIVER_UPDATE_FAILED',
              message: 'Failed to update driver status',
            });
          }

          socket.join(`ride:${updatedRide._id}`);
          socket.emit('ride:joined', {
            rideId,
            message: 'Successfully joined ride room',
          });

          // Notify driver of successful assignment
          socket.emit('response', {
            success: true,
            objectType,
            ride: updatedRide,
            message: 'Ride successfully assigned to you',
          });

          // Notify passenger of driver assignment
          io.to(`user:${ride.passengerId}`).emit('ride:status_update', {
            rideId: updatedRide.rideId,
            status: 'DRIVER_ASSIGNED',
            data: {
              ride: updatedRide,
              driver,
            },
          });
        });
      } catch (error) {
        console.error(`SOCKET ERROR: ${error}`);
        socket.emit('error', {
          success: false,
          objectType,
          code: `${error.code || 'SOCKET_ERROR'}`,
          message: `SOCKET ERROR: ${error.message}`,
        });
      } finally {
        session.endSession();
      }
    });

    socket.on('ride:driver_cancel_ride', async ({ rideId, reason }) => {
      const objectType = 'cancel-ride-driver';
      const session = await mongoose.startSession();

      try {
        await session.withTransaction(async () => {
          const driver = await findDriverByUserId(userId, { session });
          if (
            !driver ||
            driver.isBlocked ||
            driver.isSuspended ||
            driver.backgroundCheckStatus !== 'approved' ||
            driver.status !== 'on_ride'
          ) {
            return socket.emit('response', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Forbidden: Driver not eligible',
            });
          }

          const ride = await findRideById(rideId, { session });
          const driverId = ride?.driverId?._id;
          if (!ride) {
            return socket.emit('response', {
              success: false,
              objectType,
              code: 'NOT_FOUND',
              message: 'Ride not found',
            });
          } else if (driverId.toString() !== driver._id.toString()) {
            return socket.emit('response', {
              success: false,
              objectType,
              code: 'NOT_ASSIGNED',
              message: 'Cannot cancel a ride not assigned to you',
            });
          } else if (ride.status === 'CANCELLED_BY_PASSENGER') {
            return socket.emit('response', {
              success: false,
              objectType,
              code: 'ALREADY_CANCELLED',
              message: 'Ride already cancelled by passenger',
            });
          } else if (ride.status === 'CANCELLED_BY_DRIVER') {
            return socket.emit('response', {
              success: false,
              objectType,
              code: 'ALREADY_CANCELLED',
              message: 'You have already cancelled this ride',
            });
          } else if (ride.status === 'CANCELLED_BY_SYSTEM') {
            return socket.emit('response', {
              success: false,
              objectType,
              code: 'ALREADY_CANCELLED',
              message: 'Ride already cancelled by system',
            });
          } else if (ride.status === 'RIDE_COMPLETED') {
            return socket.emit('response', {
              success: false,
              objectType,
              code: 'ALREADY_COMPLETED',
              message: 'Cannot cancel a completed ride',
            });
          } else if (!ride.passengerId) {
            return socket.emit('response', {
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
            return socket.emit('response', {
              success: false,
              objectType,
              code: 'CANNOT_CANCEL',
              message: `Cannot cancel ride. Current status: ${ride.status}`,
            });
          }

          if (
            !reason ||
            reason.trim().length < 3 ||
            reason.trim().length > 500
          ) {
            return socket.emit('response', {
              success: false,
              objectType,
              code: 'INVALID_REASON',
              message:
                'Cancellation reason must be between 3 and 500 characters',
            });
          }

          const updateAvailability = await updateDriverAvailability(
            driver._id,
            true,
            null,
            { session },
          );

          if (!updateAvailability) {
            return socket.emit('response', {
              success: false,
              objectType,
              code: 'DRIVER AVAILABILITY_FAILED',
              message: 'Failed to update driver availability',
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
            return socket.emit('response', {
              success: false,
              objectType,
              code: 'RIDE_UPDATE_FAILED',
              message: 'Failed to update ride status',
            });
          }

          const updatedDriver = await updateDriverByUserId(
            userId,
            { status: 'online' },
            { session },
          );
          if (!updatedDriver) {
            // Rollback ride update inside the transaction
            await updateRideById(
              ride._id,
              {
                status: 'DRIVER_ASSIGNED',
                cancelledBy: null,
                cancellationReason: null,
                paymentStatus: 'PENDING',
              },
              { session },
            );
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'DRIVER_UPDATE_FAILED',
              message: 'Failed to update driver status',
            });
          }

          // Notify driver of successful cancellation
          socket.emit('response', {
            success: true,
            objectType,
            ride: updatedRide,
            message: 'Ride cancelled successfully',
          });

          // Notify passenger of ride cancellation
          io.to(`user:${ride.passengerId}`).emit('ride:status_update', {
            rideId: updatedRide.rideId,
            status: 'CANCELLED_BY_DRIVER',
            data: {
              ride: updatedRide,
              driver,
            },
          });

          const rooms = Array.from(socket.rooms);
          if (rooms.includes(`ride:${ride._id}`)) {
            socket.leave(`ride:${ride._id}`);
          }

          const clients = await io.in(`ride:${ride._id}`).fetchSockets();
          clients.forEach((s) => s.leave(`ride:${ride._id}`));

          socket.emit('ride:left', {
            rideId,
            message: 'You have left the ride room after cancellation.',
          });
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
      const session = await mongoose.startSession();
      try {
        session.startTransaction();

        const driver = await findDriverByUserId(userId);
        if (
          !driver ||
          driver.isBlocked ||
          driver.isSuspended ||
          driver.backgroundCheckStatus !== 'approved' ||
          driver.status !== 'on_ride'
        ) {
          await session.abortTransaction();
          session.endSession();
          return socket.emit('response', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Forbidden: Driver not eligible',
          });
        }

        const ride = await findRideById(rideId);
        const driverId = ride?.driverId?._id;
        if (!ride) {
          await session.abortTransaction();
          session.endSession();
          return socket.emit('response', {
            success: false,
            objectType,
            code: 'NOT_FOUND',
            message: 'Ride not found',
          });
        } else if (driverId.toString() !== driver._id.toString()) {
          await session.abortTransaction();
          session.endSession();
          return socket.emit('response', {
            success: false,
            objectType,
            code: 'NOT_ASSIGNED',
            message: 'Cannot update a ride not assigned to you',
          });
        }

        if (ride.status !== 'DRIVER_ASSIGNED') {
          await session.abortTransaction();
          session.endSession();
          return socket.emit('response', {
            success: false,
            objectType,
            code: 'INVALID_STATUS',
            message: `Cannot mark as arriving. Current status: ${ride.status}`,
          });
        }

        const updatedRide = await updateRideById(
          ride._id,
          {
            status: 'DRIVER_ARRIVING',
            driverArrivingAt: new Date(),
          },
          { session }, // <-- Pass the transaction session
        );
        if (!updatedRide) {
          await session.abortTransaction();
          session.endSession();
          return socket.emit('response', {
            success: false,
            objectType,
            code: 'RIDE_UPDATE_FAILED',
            message: 'Failed to update ride status',
          });
        }

        // Commit transaction before emitting events
        await session.commitTransaction();
        session.endSession();

        // Notify driver of successful update
        socket.emit('response', {
          success: true,
          objectType,
          ride: updatedRide,
          message: 'Ride status updated to DRIVER_ARRIVING',
        });

        // Notify passenger of driver arriving
        io.to(`user:${ride.passengerId}`).emit('ride:status_update', {
          rideId: updatedRide.rideId,
          status: 'DRIVER_ARRIVING',
          data: {
            ride: updatedRide,
            driver,
          },
        });
      } catch (error) {
        await session.abortTransaction();
        session.endSession();
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
      const session = await mongoose.startSession();
      try {
        session.startTransaction();

        const driver = await findDriverByUserId(userId);
        if (
          !driver ||
          driver.isBlocked ||
          driver.isSuspended ||
          driver.backgroundCheckStatus !== 'approved' ||
          driver.status !== 'on_ride'
        ) {
          await session.abortTransaction();
          session.endSession();
          return socket.emit('response', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Forbidden: Driver not eligible',
          });
        }

        const ride = await findRideById(rideId);
        const driverId = ride?.driverId?._id;

        if (!ride) {
          await session.abortTransaction();
          session.endSession();
          return socket.emit('response', {
            success: false,
            objectType,
            code: 'NOT_FOUND',
            message: 'Ride not found',
          });
        } else if (driverId.toString() !== driver._id.toString()) {
          await session.abortTransaction();
          session.endSession();
          return socket.emit('response', {
            success: false,
            objectType,
            code: 'NOT_ASSIGNED',
            message: 'Cannot update a ride not assigned to you',
          });
        }

        if (ride.status !== 'DRIVER_ARRIVING') {
          await session.abortTransaction();
          session.endSession();
          return socket.emit('response', {
            success: false,
            objectType,
            code: 'INVALID_STATUS',
            message: `Cannot mark as arrived. Current status: ${ride.status}`,
          });
        }

        const updatedRide = await updateRideById(
          ride._id,
          {
            status: 'DRIVER_ARRIVED',
            driverArrivedAt: new Date(),
          },
          { session }, // transaction session passed here
        );
        if (!updatedRide) {
          await session.abortTransaction();
          session.endSession();
          return socket.emit('response', {
            success: false,
            objectType,
            code: 'RIDE_UPDATE_FAILED',
            message: 'Failed to update ride status',
          });
        }

        // Commit transaction before emitting events
        await session.commitTransaction();
        session.endSession();

        // Notify driver of successful update
        socket.emit('response', {
          success: true,
          objectType,
          ride: updatedRide,
          message: 'Ride status updated to DRIVER_ARRIVED',
        });

        // Notify passenger of driver arrival
        io.to(`user:${ride.passengerId}`).emit('ride:status_update', {
          rideId: updatedRide.rideId,
          status: 'DRIVER_ARRIVED',
          data: {
            ride: updatedRide,
            driver,
          },
        });
      } catch (error) {
        await session.abortTransaction();
        session.endSession();
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
      const session = await mongoose.startSession();
      try {
        session.startTransaction();

        const driver = await findDriverByUserId(userId);
        if (
          !driver ||
          driver.isBlocked ||
          driver.isSuspended ||
          driver.backgroundCheckStatus !== 'approved' ||
          driver.status !== 'on_ride'
        ) {
          await session.abortTransaction();
          session.endSession();
          return socket.emit('response', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Forbidden: Driver not eligible',
          });
        }

        const ride = await findRideById(rideId);
        const driverId = ride?.driverId?._id;
        if (!ride) {
          await session.abortTransaction();
          session.endSession();
          return socket.emit('response', {
            success: false,
            objectType,
            code: 'NOT_FOUND',
            message: 'Ride not found',
          });
        } else if (driverId.toString() !== driver._id.toString()) {
          await session.abortTransaction();
          session.endSession();
          return socket.emit('response', {
            success: false,
            objectType,
            code: 'NOT_ASSIGNED',
            message: 'Cannot update a ride not assigned to you',
          });
        }

        if (ride.status !== 'DRIVER_ARRIVED') {
          await session.abortTransaction();
          session.endSession();
          return socket.emit('response', {
            success: false,
            objectType,
            code: 'INVALID_STATUS',
            message: `Cannot start ride. Current status: ${ride.status}`,
          });
        }

        const updatedRide = await updateRideById(
          ride._id,
          {
            status: 'RIDE_STARTED',
            rideStartedAt: new Date(),
          },
          { session }, // include transaction session
        );
        if (!updatedRide) {
          await session.abortTransaction();
          session.endSession();
          return socket.emit('response', {
            success: false,
            objectType,
            code: 'RIDE_UPDATE_FAILED',
            message: 'Failed to update ride status',
          });
        }

        // Commit the transaction
        await session.commitTransaction();
        session.endSession();

        // Notify driver of successful update
        socket.emit('response', {
          success: true,
          objectType,
          ride: updatedRide,
          message: 'Ride status updated to RIDE_STARTED',
        });

        // Notify passenger of ride start
        io.to(`user:${ride.passengerId}`).emit('ride:status_update', {
          rideId: updatedRide.rideId,
          status: 'RIDE_STARTED',
          data: {
            ride: updatedRide,
            driver,
          },
        });
      } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error(`SOCKET ERROR: ${error}`);
        return socket.emit('error', {
          success: false,
          objectType,
          code: `${error.code || 'SOCKET_ERROR'}`,
          message: `SOCKET ERROR: ${error.message}`,
        });
      }
    });

    socket.on('ride:driver_complete_ride', async ({ rideId }) => {
      const objectType = 'driver-complete-ride';
      const session = await mongoose.startSession();
      try {
        session.startTransaction();

        const driver = await findDriverByUserId(userId);
        if (
          !driver ||
          driver.isBlocked ||
          driver.isSuspended ||
          driver.backgroundCheckStatus !== 'approved' ||
          driver.status !== 'on_ride'
        ) {
          await session.abortTransaction();
          session.endSession();
          return socket.emit('response', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Forbidden: Driver not eligible',
          });
        }

        const ride = await findRideById(rideId);
        const driverId = ride?.driverId?._id;
        if (!ride) {
          await session.abortTransaction();
          session.endSession();
          return socket.emit('response', {
            success: false,
            objectType,
            code: 'NOT_FOUND',
            message: 'Ride not found',
          });
        } else if (driverId.toString() !== driver._id.toString()) {
          await session.abortTransaction();
          session.endSession();
          return socket.emit('response', {
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
          await session.abortTransaction();
          session.endSession();
          return socket.emit('response', {
            success: false,
            objectType,
            code: 'INVALID_STATUS',
            message: `Cannot complete ride. Current status: ${ride.status}`,
          });
        }

        const updatedRide = await updateRideById(
          ride._id,
          {
            status: 'RIDE_COMPLETED',
            rideCompletedAt: new Date(),
            paymentStatus: 'COMPLETED',
          },
          { session }, // transaction session
        );
        if (!updatedRide) {
          await session.abortTransaction();
          session.endSession();
          return socket.emit('response', {
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
          { session },
        );
        if (!updateAvailability) {
          await session.abortTransaction();
          session.endSession();
          return socket.emit('response', {
            success: false,
            objectType,
            code: 'DRIVER AVAILABILITY_FAILED',
            message: 'Failed to update driver availability',
          });
        }

        const updatedDriver = await updateDriverByUserId(
          userId,
          { status: 'online' },
          { session },
        );
        if (!updatedDriver) {
          // Rollback ride update
          await updateRideById(
            ride._id,
            {
              status: 'RIDE_STARTED',
              rideCompletedAt: null,
              paymentStatus: 'PENDING',
            },
            { session },
          );
          await session.abortTransaction();
          session.endSession();
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'DRIVER_UPDATE_FAILED',
            message: 'Failed to update driver status',
          });
        }

        await session.commitTransaction();
        session.endSession();

        // Notify driver of successful update
        socket.emit('response', {
          success: true,
          objectType,
          ride: updatedRide,
          message: 'Ride status updated to RIDE_COMPLETED',
        });

        // Notify passenger of ride completion
        io.to(`user:${ride.passengerId}`).emit('ride:status_update', {
          rideId: updatedRide.rideId,
          status: 'RIDE_COMPLETED',
          data: {
            ride: updatedRide,
            driver,
          },
        });
      } catch (error) {
        await session.abortTransaction();
        session.endSession();
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
      'ride:driver_rate_passenger',
      async ({ rideId, rating, feedback }) => {
        const objectType = 'driver-rate-passenger';
        let session;
        try {
          const driver = await findDriverByUserId(userId);
          if (
            !driver ||
            driver.isBlocked ||
            driver.isSuspended ||
            driver.backgroundCheckStatus !== 'approved' ||
            driver.status !== 'online'
          ) {
            return socket.emit('response', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Forbidden: Driver not eligible',
            });
          }

          const ride = await findRideById(rideId);
          const driverId = ride?.driverId?._id;
          if (!ride) {
            return socket.emit('response', {
              success: false,
              objectType,
              code: 'NOT_FOUND',
              message: 'Ride not found',
            });
          }

          if (driverId.toString() !== driver._id.toString()) {
            return socket.emit('response', {
              success: false,
              objectType,
              code: 'NOT_ASSIGNED',
              message: 'Cannot rate passenger for a ride not assigned to you',
            });
          }

          if (ride.status !== 'RIDE_COMPLETED') {
            return socket.emit('response', {
              success: false,
              objectType,
              code: 'INVALID_STATUS',
              message: `Cannot rate passenger. Current ride status: ${ride.status}`,
            });
          }

          if (ride.passengerRating) {
            return socket.emit('response', {
              success: false,
              objectType,
              code: 'ALREADY_RATED',
              message: 'You have already rated this passenger for this ride',
            });
          }

          if (typeof rating !== 'number' || rating < 1 || rating > 5) {
            return socket.emit('response', {
              success: false,
              objectType,
              code: 'INVALID_RATING',
              message: 'Rating must be a number between 1 and 5',
            });
          }

          if (feedback && (feedback.length < 3 || feedback.length > 500)) {
            return socket.emit('response', {
              success: false,
              objectType,
              code: 'INVALID_FEEDBACK',
              message: 'Feedback must be between 3 and 500 characters',
            });
          }

          // Start Mongoose transaction for rating update
          session = await mongoose.startSession();
          session.startTransaction();

          const updatedRide = await updateRideById(
            ride._id,
            {
              passengerRating: {
                rating,
                feedback: feedback?.trim() || '',
              },
            },
            { session }, // pass session to ensure transaction safety
          );

          if (!updatedRide) {
            await session.abortTransaction();
            session.endSession();
            return socket.emit('response', {
              success: false,
              objectType,
              code: 'RIDE_UPDATE_FAILED',
              message: 'Failed to save passenger rating',
            });
          }

          await session.commitTransaction();
          session.endSession();

          // Notify driver of successful rating
          socket.emit('response', {
            success: true,
            objectType,
            ride: updatedRide,
            message: 'Passenger rated successfully',
          });

          // Notify passenger of new rating
          io.to(`user:${ride.passengerId}`).emit('ride:passenger_rated', {
            rideId: updatedRide.rideId,
            rating: updatedRide.passengerRating,
            data: {
              ride: updatedRide,
              driver,
            },
          });

          socket.leave(`ride:${ride._id}`);
          socket.emit('ride:left', {
            rideId,
            message: 'Successfully left ride room',
          });
        } catch (error) {
          if (session) {
            await session.abortTransaction();
            session.endSession();
          }
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
        let session;
        try {
          const driver = await findDriverByUserId(userId);
          if (
            !driver ||
            driver.isBlocked ||
            driver.isSuspended ||
            driver.backgroundCheckStatus !== 'approved' ||
            !['online', 'on_ride'].includes(driver.status)
          ) {
            return socket.emit('response', {
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
            return socket.emit('response', {
              success: false,
              objectType,
              code: 'INVALID_LOCATION',
              message:
                'Location must be a GeoJSON Point [lng, lat] with valid numbers',
            });
          }

          if (typeof speed !== 'number' || !speed || speed < 0 || speed > 100) {
            return socket.emit('response', {
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
            return socket.emit('response', {
              success: false,
              objectType,
              code: 'INVALID_HEADING',
              message: 'Heading must be greater 0 and less than 360',
            });
          }

          if (typeof isAvailable !== 'boolean') {
            return socket.emit('response', {
              success: false,
              objectType,
              code: 'INVALID_AVAILABILITY',
              message: 'isAvailable must be a boolean',
            });
          }

          if (driver.status === 'on_ride' && isAvailable) {
            isAvailable = false;
          }

          // Start transaction
          session = await mongoose.startSession();
          session.startTransaction();

          await saveDriverLocation(driver._id, {
            lng: location.coordinates[0],
            lat: location.coordinates[1],
            isAvailable,
            speed,
            heading,
          });

          if (driver.currentRideId) {
            io.to(`ride:${driver.currentRideId}`).emit('response', {
              driverId: driver._id,
              coordinates: location.coordinates,
              timestamp: Date.now(),
            });
          }

          await persistDriverLocationToDB(driver._id.toString()).catch((err) =>
            console.error(
              `Failed to persist driver location for driver ${driver._id}:`,
              err,
            ),
          );

          await session.commitTransaction();
          session.endSession();

          socket.emit('response', {
            success: true,
            objectType,
            code: 'LOCATION_SAVED',
            message: 'Location updated successfully',
          });
        } catch (error) {
          if (session) {
            await session.abortTransaction();
            session.endSession();
          }
          console.error(`SOCKET ERROR (driver:${userId}):`, error);
          socket.emit('response', {
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
      try {
        const driver = await findDriverByUserId(userId);
        if (
          !driver ||
          !driver.isDestination ||
          driver.isBlocked ||
          driver.isSuspended ||
          driver.backgroundCheckStatus !== 'approved' ||
          driver.status !== 'online'
        ) {
          return socket.emit('response', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Forbidden: Driver not eligible',
          });
        }

        const destination = await findAllDestination(driver._id);
        if (!destination || !destination.length()) {
          return socket.emit('response', {
            success: false,
            objectType,
            code: 'NO_DESTINATION',
            message: 'You have no destination enabled',
          });
        }

        const coordinates = destination[0].location.coordinates;
        const rides = await findNearbyRideRequests(coordinates);

        socket.emit('response', {
          success: true,
          objectType,
          data: {
            total: rides.length(),
            rides,
          },
          message: 'Rides fetched successfully',
        });
      } catch (error) {
        console.error(`SOCKET ERROR (driver:${userId}):`, error);
        socket.emit('response', {
          success: false,
          objectType,
          code: error.code || 'SOCKET_ERROR',
          message: `SOCKET ERROR: ${error.message}`,
        });
      }
    });

    // Passenger Events
    socket.on('ride:passenger_join_ride', async ({ rideId }) => {
      const objectType = 'passenger-join-ride';
      let session;
      try {
        // Start transaction
        session = await mongoose.startSession();
        session.startTransaction();

        const passenger = await findPassengerByUserId(userId, { session });
        if (!passenger || passenger.isBlocked || passenger.isSuspended) {
          await session.abortTransaction();
          session.endSession();
          return socket.emit('response', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Forbidden: Passenger not eligible',
          });
        }

        const ride = await findRideByRideId(rideId, { session });
        const passengerId = ride?.passengerId?._id;
        if (!ride) {
          await session.abortTransaction();
          session.endSession();
          return socket.emit('response', {
            success: false,
            objectType,
            code: 'NOT_FOUND',
            message: 'Ride not found',
          });
        } else if (passengerId.toString() !== passenger._id.toString()) {
          await session.abortTransaction();
          session.endSession();
          return socket.emit('response', {
            success: false,
            objectType,
            code: 'NOT_OWNED',
            message: 'Cannot join a ride not booked by you',
          });
        } else if (ride.status === 'CANCELLED_BY_PASSENGER') {
          await session.abortTransaction();
          session.endSession();
          return socket.emit('response', {
            success: false,
            objectType,
            code: 'ALREADY_CANCELLED',
            message: 'Ride already cancelled by you',
          });
        } else if (ride.status === 'CANCELLED_BY_DRIVER') {
          await session.abortTransaction();
          session.endSession();
          return socket.emit('response', {
            success: false,
            objectType,
            code: 'CANCELLED_BY_DRIVER',
            message: 'Ride already cancelled by the driver',
          });
        } else if (ride.status === 'CANCELLED_BY_SYSTEM') {
          await session.abortTransaction();
          session.endSession();
          return socket.emit('response', {
            success: false,
            objectType,
            code: 'ALREADY_CANCELLED',
            message: 'Ride already cancelled by system',
          });
        } else if (ride.status === 'RIDE_COMPLETED') {
          await session.abortTransaction();
          session.endSession();
          return socket.emit('response', {
            success: false,
            objectType,
            code: 'RIDE_COMPLETED',
            message: 'Cannot join a completed ride',
          });
        } else if (!ride.driverId) {
          await session.abortTransaction();
          session.endSession();
          return socket.emit('response', {
            success: false,
            objectType,
            code: 'NO_DRIVER_ASSIGNED',
            message: 'Cannot join ride. No driver assigned yet',
          });
        } else if (ride.status === 'REQUESTED') {
          await session.abortTransaction();
          session.endSession();
          return socket.emit('response', {
            success: false,
            objectType,
            code: 'DRIVER_NOT_ASSIGNED',
            message: 'Cannot join ride. Driver not yet assigned',
          });
        }

        // Commit transaction after successful checks
        await session.commitTransaction();
        session.endSession();

        // Join ride room
        socket.join(`ride:${ride._id}`);
        socket.emit('ride:joined', {
          rideId,
          message: 'Successfully joined ride room',
        });

        socket.emit('response', {
          success: true,
          objectType,
          ride,
          message: 'Successfully joined ride room',
        });
      } catch (error) {
        if (session) {
          await session.abortTransaction();
          session.endSession();
        }
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
      let session;
      try {
        // Start a Mongoose session
        session = await mongoose.startSession();
        session.startTransaction();

        const passenger = await findPassengerByUserId(userId, { session });
        if (!passenger || passenger.isBlocked || passenger.isSuspended) {
          await session.abortTransaction();
          session.endSession();
          return socket.emit('response', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Forbidden: Passenger not eligible',
          });
        }

        const ride = await findRideById(rideId, { session });
        const passengerId = ride?.passengerId?._id;
        if (!ride) {
          await session.abortTransaction();
          session.endSession();
          return socket.emit('response', {
            success: false,
            objectType,
            code: 'NOT_FOUND',
            message: 'Ride not found',
          });
        } else if (passengerId.toString() !== passenger._id.toString()) {
          await session.abortTransaction();
          session.endSession();
          return socket.emit('response', {
            success: false,
            objectType,
            code: 'NOT_OWNED',
            message: 'Cannot cancel a ride not booked by you',
          });
        } else if (ride.status === 'CANCELLED_BY_PASSENGER') {
          await session.abortTransaction();
          session.endSession();
          return socket.emit('response', {
            success: false,
            objectType,
            code: 'ALREADY_CANCELLED',
            message: 'Ride already cancelled by you',
          });
        } else if (ride.status === 'CANCELLED_BY_DRIVER') {
          await session.abortTransaction();
          session.endSession();
          return socket.emit('response', {
            success: false,
            objectType,
            code: 'CANCELLED_BY_DRIVER',
            message: 'Ride already cancelled by the driver',
          });
        } else if (ride.status === 'CANCELLED_BY_SYSTEM') {
          await session.abortTransaction();
          session.endSession();
          return socket.emit('response', {
            success: false,
            objectType,
            code: 'ALREADY_CANCELLED',
            message: 'Ride already cancelled by system',
          });
        } else if (ride.status === 'RIDE_COMPLETED') {
          await session.abortTransaction();
          session.endSession();
          return socket.emit('response', {
            success: false,
            objectType,
            code: 'RIDE_COMPLETED',
            message: 'Cannot cancel a completed ride',
          });
        } else if (!ride.driverId) {
          await session.abortTransaction();
          session.endSession();
          return socket.emit('response', {
            success: false,
            objectType,
            code: 'NO_DRIVER_ASSIGNED',
            message: 'Cannot cancel ride. No driver assigned yet',
          });
        }

        const cancellableStatuses = [
          'REQUESTED',
          'DRIVER_ASSIGNED',
          'DRIVER_ARRIVING',
          'DRIVER_ARRIVED',
        ];
        if (!cancellableStatuses.includes(ride.status)) {
          await session.abortTransaction();
          session.endSession();
          return socket.emit('response', {
            success: false,
            objectType,
            code: 'CANNOT_CANCEL',
            message: `Cannot cancel ride. Current status: ${ride.status}`,
          });
        }

        if (!reason || reason.trim().length < 3 || reason.trim().length > 500) {
          await session.abortTransaction();
          session.endSession();
          return socket.emit('response', {
            success: false,
            objectType,
            code: 'INVALID_REASON',
            message: 'Cancellation reason must be between 3 and 500 characters',
          });
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
          session.endSession();
          return socket.emit('response', {
            success: false,
            objectType,
            code: 'RIDE_UPDATE_FAILED',
            message: 'Failed to update ride status',
          });
        }

        const updateAvailability = await updateDriverAvailability(
          updatedRide.driverId,
          true,
          null,
          { session },
        );
        if (!updateAvailability) {
          await session.abortTransaction();
          session.endSession();
          return socket.emit('response', {
            success: false,
            objectType,
            code: 'DRIVER AVAILABILITY_FAILED',
            message: 'Failed to update driver availability',
          });
        }

        // Commit transaction after successful DB operations
        await session.commitTransaction();
        session.endSession();

        // Notify driver of ride cancellation
        io.to(`user:${ride.driverId}`).emit('ride:status_update', {
          rideId: updatedRide.rideId,
          status: 'CANCELLED_BY_PASSENGER',
          data: { ride: updatedRide, passenger },
        });

        // Notify passenger of successful cancellation
        socket.emit('response', {
          success: true,
          objectType,
          ride: updatedRide,
          message: 'Ride cancelled successfully',
        });

        const rooms = Array.from(socket.rooms);
        if (rooms.includes(`ride:${ride._id}`)) {
          socket.leave(`ride:${ride._id}`);
        }

        const clients = await io.in(`ride:${ride._id}`).fetchSockets();
        clients.forEach((s) => s.leave(`ride:${ride._id}`));

        socket.emit('ride:left', {
          rideId,
          message: 'You have left the ride room after cancellation.',
        });
      } catch (error) {
        if (session) {
          await session.abortTransaction();
          session.endSession();
        }
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
      'ride:passenger_rate_driver',
      async ({ rideId, rating, feedback }) => {
        const objectType = 'passenger-rate-driver';
        const session = await mongoose.startSession();
        try {
          session.startTransaction();

          const passenger = await findPassengerByUserId(userId);
          if (!passenger || passenger.isBlocked || passenger.isSuspended) {
            await session.abortTransaction();
            session.endSession();
            return socket.emit('response', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Forbidden: Passenger not eligible',
            });
          }

          const ride = await findRideById(rideId);
          const passengerId = ride?.passengerId?._id;
          if (!ride) {
            await session.abortTransaction();
            session.endSession();
            return socket.emit('response', {
              success: false,
              objectType,
              code: 'NOT_FOUND',
              message: 'Ride not found',
            });
          } else if (ride.status !== 'RIDE_COMPLETED') {
            await session.abortTransaction();
            session.endSession();
            return socket.emit('response', {
              success: false,
              objectType,
              code: 'INVALID_STATUS',
              message: `Cannot rate driver. Current ride status: ${ride.status}`,
            });
          } else if (ride.driverRating) {
            await session.abortTransaction();
            session.endSession();
            return socket.emit('response', {
              success: false,
              objectType,
              code: 'ALREADY_RATED',
              message: 'You have already rated this driver for this ride',
            });
          } else if (typeof rating !== 'number' || rating < 1 || rating > 5) {
            await session.abortTransaction();
            session.endSession();
            return socket.emit('response', {
              success: false,
              objectType,
              code: 'INVALID_RATING',
              message: 'Rating must be a number between 1 and 5',
            });
          } else if (
            feedback &&
            (feedback.length < 3 || feedback.length > 500)
          ) {
            await session.abortTransaction();
            session.endSession();
            return socket.emit('response', {
              success: false,
              objectType,
              code: 'INVALID_FEEDBACK',
              message: 'Feedback must be between 3 and 500 characters',
            });
          } else if (passengerId.toString() !== passenger._id.toString()) {
            await session.abortTransaction();
            session.endSession();
            return socket.emit('response', {
              success: false,
              objectType,
              code: 'NOT_OWNED',
              message: 'Cannot rate driver for a ride not booked by you',
            });
          }

          const updatedRide = await updateRideById(
            ride._id,
            {
              driverRating: {
                rating,
                feedback: feedback?.trim() || '',
              },
            },
            { session }, // Pass the transaction session
          );

          if (!updatedRide) {
            await session.abortTransaction();
            session.endSession();
            return socket.emit('response', {
              success: false,
              objectType,
              code: 'RIDE_UPDATE_FAILED',
              message: 'Failed to save driver rating',
            });
          }

          await session.commitTransaction();
          session.endSession();

          // Notify passenger of successful rating
          socket.emit('response', {
            success: true,
            objectType,
            ride: updatedRide,
            message: 'Driver rated successfully',
          });

          // Notify driver of new rating
          io.to(`user:${ride.driverId}`).emit('ride:driver_rated', {
            rideId: updatedRide.rideId,
            rating: updatedRide.driverRating,
            data: {
              ride: updatedRide,
              passenger,
            },
          });

          socket.leave(`ride:${ride._id}`);
          socket.emit('ride:left', {
            rideId,
            message: 'Successfully left ride room',
          });
        } catch (error) {
          await session.abortTransaction();
          session.endSession();
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

    // Event: Join ride room for real-time communication
    socket.on('ride:join', async ({ rideId }) => {
      try {
        const ride = await findRideByRideId(rideId);
        if (!ride) {
          return socket.emit('error', { message: 'Ride not found' });
        }

        // Check if user is participant in this ride
        const participants = [
          ride.passengerId?.userId?.toString(),
          ride.driverId?.userId?.toString(),
        ].filter(Boolean);

        if (!participants.includes(userId)) {
          return socket.emit('error', {
            message: 'Forbidden: Not a participant in this ride',
          });
        }

        socket.join(`ride:${rideId}`);
        socket.emit('ride:joined', {
          rideId,
          message: 'Successfully joined ride room',
        });

        // Notify other participants that user joined
        socket.to(`ride:${rideId}`).emit('ride:user_joined', {
          userId,
          rideId,
          timestamp: new Date(),
        });

        console.log(`📍 User ${userId} joined ride room: ${rideId}`);
      } catch (error) {
        console.error('Error joining ride room:', error);
        socket.emit('error', { message: 'Failed to join ride room' });
      }
    });

    // Event: Real-time location updates (primarily for drivers)
    socket.on('ride:location', ({ rideId, coords, heading, speed }) => {
      if (!rideId || !coords) {
        return socket.emit('error', { message: 'Invalid location data' });
      }

      // Broadcast location to all participants in the ride
      io.to(`ride:${rideId}`).emit('ride:location', {
        rideId,
        coords,
        heading,
        speed,
        senderId: userId,
        timestamp: Date.now(),
      });
    });

    // Event: Send chat message
    socket.on('chat:send', async ({ rideId, tempId, text }) => {
      try {
        if (!text?.trim()) {
          return socket.emit('error', { message: 'Message text is required' });
        }

        // Save message to database
        const msg = await createMessage({
          rideId,
          senderId: userId,
          text: text.trim(),
        });

        // Acknowledge to sender with message ID
        socket.emit('chat:ack', {
          tempId,
          messageId: msg._id.toString(),
          timestamp: msg.createdAt,
        });

        // Broadcast message to all participants in the ride
        io.to(`ride:${rideId}`).emit('chat:message', {
          messageId: msg._id.toString(),
          rideId,
          senderId: userId,
          text: msg.text,
          createdAt: msg.createdAt,
        });

        console.log(`💬 Message sent in ride ${rideId} by user ${userId}`);
      } catch (error) {
        console.error('Error sending chat message:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Event: Mark message as read
    socket.on('chat:read', async ({ rideId, messageId }) => {
      try {
        if (!rideId || !messageId) {
          return socket.emit('error', { message: 'Invalid read receipt data' });
        }

        const result = await markMessageRead(messageId, userId);
        if (result?.acknowledged) {
          // Broadcast read receipt to all participants
          io.to(`ride:${rideId}`).emit('chat:read', {
            messageId,
            readAt: new Date(),
            readBy: userId,
          });
        }
      } catch (error) {
        console.error('Error marking message as read:', error);
      }
    });

    // Event: Typing indicator
    socket.on('chat:typing', ({ rideId, isTyping }) => {
      if (!rideId) return;

      socket.to(`ride:${rideId}`).emit('chat:typing', {
        rideId,
        userId,
        isTyping,
        timestamp: Date.now(),
      });
    });

    // Event: Ride status updates
    socket.on('ride:status_update', ({ rideId, status, data }) => {
      if (!rideId || !status) return;

      io.to(`ride:${rideId}`).emit('ride:status_update', {
        rideId,
        status,
        data,
        updatedBy: userId,
        timestamp: Date.now(),
      });
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
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
