import mongoose from 'mongoose';
import { Server } from 'socket.io';
import Redis from 'ioredis';
import { createAdapter } from '@socket.io/redis-adapter';
import { addSocket, removeSocket, getSocketIds } from '../utils/onlineUsers.js';
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
  findRide,
  findRideByRideId,
  findDriverLocation,
  findPendingRides,
  findPendingAirportRides,
  updateRideById,
  findRideById,
  saveDriverLocation,
  removeDriverLocation,
  persistDriverLocationToDB,
  updateDriverAvailability,
  findNearbyRideRequests,
  findNearestParkingForPickup,
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
  haversineDistance,
  findDriverParkingQueue,
  getDriverLocation,
  findParkingQueue,
  checkDestinationRides,
} from '../dal/ride.js';
import {
  findDriverByUserId,
  updateDriverByUserId,
  toggleDriverLocation,
  findAllDestination,
  findDriverById,
  onRideAccepted,
  onRideCancelled,
  findDriverData,
  handleDriverRideResponse,
} from '../dal/driver.js';
import { calculateActualFare } from '../services/User/ride/fareCalculationService.js';
import { findPassengerByUserId, findPassengerById } from '../dal/passenger.js';
import {
  passengerPaysDriver,
  payDriverFromWallet,
  captureHeldPayment,
  cancelPaymentHold,
  processDriverPayoutAfterCapture,
  transferTipToDriverExternalAccount,
  captureFullPaymentOnCancellation,
} from '../dal/stripe.js';
import { createCallLog, findCallById, updateCallLogById } from '../dal/call.js';
import { findDrivingHours } from '../dal/stats.js';
import { findDashboardData } from '../dal/admin/index.js';
import { findUserById } from '../dal/user/index.js';
import {
  notifyUser,
  findAdminNotifications,
  toggleNotificationReadStatus,
  markAllNotificationsAsRead,
  findUnreadNotificationsCount,
} from '../dal/notification.js';
import { generateAgoraToken } from '../utils/agoraTokenGenerator.js';
import { generateRideReceipt } from '../utils/receiptGenerator.js';
import {
  sendPassengerRideCancellationWarningEmail,
  sendDriverRideCancellationEmail,
} from '../templates/emails/user/index.js';
import { scheduledRideQueue } from '../scheduled/queues/index.js';

let ioInstance = null;

export const initSocket = (server) => {
  if (ioInstance) return ioInstance;

  const io = new Server(server, {
    pingTimeout: 60000,
    pingInterval: 25000,
    cors: {
      origin: '*',
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

  // JWT Authentication middleware for socket connections (optional)
  io.use((socket, next) => {
    const authHeader =
      socket.handshake.auth?.token || socket.handshake.headers?.authorization;
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : authHeader;
    const payload = token ? verifyAccessToken(token) : null;

    // Allow connections without tokens, but set user if token is valid
    if (payload?.id) {
      socket.user = { id: payload.id, roles: payload.roles || [] };
    } else {
      socket.user = null;
    }
    next();
  });

  io.on('connection', (socket) => {
    const userId = socket.user?.id;
    const userRole = socket.user?.roles?.[0];
    const authHeader =
      socket.handshake.auth?.token || socket.handshake.headers?.authorization;
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : authHeader;

    // Log active user connection with role and token
    if (userId && userRole) {
      console.log('🔌 [ACTIVE USER CONNECTED:', {
        userId,
        role: userRole,
        token: token || 'No token',
        socketId: socket.id,
        timestamp: new Date().toISOString(),
      });
    } else {
      console.log('🔌 [ACTIVE] Anonymous connection:', {
        socketId: socket.id,
        timestamp: new Date().toISOString(),
      });
    }

    // Helper function to process payment for a completed ride
    const processRidePayment = async (rideId) => {
      const objectType = 'pay-driver';
      try {
        const ride = await findRideById(rideId);
        if (
          !ride ||
          ride.status !== 'RIDE_COMPLETED' ||
          !ride.actualFare ||
          ride.actualFare <= 0 ||
          ride.paymentStatus === 'COMPLETED'
        ) {
          return {
            success: false,
            error: 'Invalid ride state for payment processing',
          };
        }

        const passenger = await findPassengerById(ride.passengerId._id);
        const driver = await findDriverById(ride.driverId._id);
        if (!passenger || !driver) {
          return { success: false, error: 'Driver or Passenger not found' };
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
          if (fare.success) {
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
            if (receipt) {
              await notifyUser({
                userId: ride.passengerId?.userId,
                title: 'Payment Successful!',
                message: `Thanks for riding with RIDEN. Your payment of ${ride.actualAmount} was completed successfully. Receipts are available in your ride history`,
                module: 'payment',
                metadata: ride,
                type: 'ALERT',
                actionLink: `pay_driver`,
                isPush: false,
              });

              await notifyUser({
                userId: ride.driverId?.userId,
                title: 'Payment Done',
                message: `Payment successful! ${fare} has been added to your Riden wallet`,
                module: 'payment',
                metadata: ride,
                type: 'ALERT',
                actionLink: `driver_get_paid`,
              });

              // Emit to ride room (for all participants)
              io.to(`ride:${ride._id}`).emit('ride:pay_driver', {
                success: true,
                objectType,
                data: {
                  ride,
                  transaction: fare.transaction,
                },
                message: 'Fare successfully paid to driver',
              });

              // Also emit directly to passenger's personal room to ensure they receive payment notification
              // This is especially important for scheduled rides where passenger might not be actively in ride room
              const passengerUserIdForPayment = ride.passengerId?.userId?._id?.toString() ||
                ride.passengerId?.userId?.toString() ||
                ride.passengerId?.userId;
              
              if (passengerUserIdForPayment) {
                emitToUser(passengerUserIdForPayment, 'ride:pay_driver', {
                  success: true,
                  objectType,
                  data: {
                    ride,
                    transaction: fare.transaction,
                  },
                  message: 'Payment completed successfully. Fare details available.',
                });
              }

              return { success: true };
            } else {
              return {
                success: false,
                error: fare.error || 'Payment processing failed',
              };
            }
          } else {
            return {
              success: false,
              error: fare.error || 'Payment processing failed',
            };
          }
        } else if (
          ride.paymentMethod === 'CARD' ||
          ride.paymentMethod === 'GOOGLE_PAY' ||
          ride.paymentMethod === 'APPLE_PAY'
        ) {
          const adminCommission = await deductRidenCommission(
            ride.carType,
            ride.actualFare,
            ride.fareBreakdown?.promoDiscount,
            ride._id,
          );

          let fare;
          if (ride.paymentIntentId) {
            const captureResult = await captureHeldPayment(
              ride.paymentIntentId,
              ride.actualFare,
              ride._id,
            );

            if (captureResult.success) {
              fare = await processDriverPayoutAfterCapture(
                passenger,
                driver,
                ride,
                ride.actualFare - adminCommission,
                ride.actualFare,
                ride.paymentIntentId,
                'RIDE',
              );
            } else {
              return {
                success: false,
                error: captureResult.error || 'Failed to capture payment',
              };
            }
          } else {
            const paymentMethodId =
              ride.cardId || passenger.defaultCardId || ride.paymentMethod;
            fare = await passengerPaysDriver(
              passenger,
              driver,
              ride,
              ride.actualFare - adminCommission,
              ride.actualFare,
              paymentMethodId,
              'RIDE',
            );
          }

          if (fare && fare.success) {
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
            if (receipt) {
              await notifyUser({
                userId: ride.passengerId?.userId,
                title: 'Payment Successful!',
                message: `Thanks for riding with RIDEN. Your payment of ${ride.actualAmount} was completed successfully. Receipts are available in your ride history`,
                module: 'payment',
                metadata: ride,
                type: 'ALERT',
                actionLink: `pay_driver`,
                isPush: false,
              });

              await notifyUser({
                userId: ride.driverId?.userId,
                title: 'Payment Done',
                message: `Payment successful! ${fare} has been added to your Riden wallet`,
                module: 'payment',
                metadata: ride,
                type: 'ALERT',
                actionLink: `driver_get_paid`,
              });

              // Emit to ride room (for all participants)
              io.to(`ride:${ride._id}`).emit('ride:pay_driver', {
                success: true,
                objectType,
                data: {
                  ride,
                  transaction: fare.transaction,
                  paymentIntentId: ride.paymentIntentId || undefined,
                },
                message: 'Driver Paid Successfully',
              });

              // Also emit directly to passenger's personal room to ensure they receive payment notification
              // This is especially important for scheduled rides where passenger might not be actively in ride room
              const passengerUserIdForPayment = ride.passengerId?.userId?._id?.toString() ||
                ride.passengerId?.userId?.toString() ||
                ride.passengerId?.userId;
              
              if (passengerUserIdForPayment) {
                emitToUser(passengerUserIdForPayment, 'ride:pay_driver', {
                  success: true,
                  objectType,
                  data: {
                    ride,
                    transaction: fare.transaction,
                    paymentIntentId: ride.paymentIntentId || undefined,
                  },
                  message: 'Payment completed successfully. Fare details available.',
                });
              }

              return { success: true };
            }
          } else {
            return {
              success: false,
              error: fare.error || 'Payment processing failed',
            };
          }
        }
        return { success: false, error: 'Unsupported payment method' };
      } catch (error) {
        console.error(`SOCKET ERROR in payment processing: ${error}`);
        return {
          success: false,
          error: error.message || 'Payment processing failed',
        };
      }
    };

    if (userId) {
      console.log(`🔌 User ${userId} connected to socket`);
      // add to online registry
      addSocket(userId, socket.id).catch(console.error);
      // Join user's personal room for direct notifications
      socket.join(`user:${userId}`);
    } else {
      console.log(`🔌 Anonymous user connected to socket`);
    }

    if (userRole && userRole === 'driver') {
      socket.on('driver:update_status', async () => {
        if (!userId) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
          });
        }

        const objectType = 'driver-update-status';
        try {
          const driver = await findDriverByUserId(userId);
          if (!driver) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'NOT_FOUND',
              message: 'Driver not found',
            });
          } else if (driver.isBlocked || driver.status === 'blocked') {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Driver is blocked',
            });
          } else if (driver.isSuspended || driver.status === 'suspended') {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Driver is suspended',
            });
          } else if (!driver.legalAgreemant) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Legal Agreement not approved',
            });
          } else if (
            !driver.stripeAccountId ||
            driver.stripeAccountId.trim() === ''
          ) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Connected account not found',
            });
          } else if (driver.backgroundCheckStatus !== 'approved') {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Driver backgound not approved',
            });
          } else if (!driver.wayBill) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Way bill not issued',
              isWayBill: false,
            });
          } else if (!driver.documents) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Documents not uploaded',
              isDocuments: false,
            });
          } else if (driver.vehicle.length < 5) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Vehicle details not provided',
              isVehicle: false,
            });
          } else if (
            !driver.payoutMethodIds ||
            driver.payoutMethodIds.length <= 0
          ) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Payout method not found',
              isPayment: false,
            });
          } else if (
            !driver.defaultAccountId ||
            driver.defaultAccountId.trim() === ''
          ) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Default payout method not found',
              isPayment: false,
            });
          }

          const vehicle = driver.vehicle;
          if (
            (!vehicle?.type || vehicle.type.trim() === '') &&
            (!vehicle?.model || vehicle.model.trim() === '') &&
            (!vehicle?.plateNumber || vehicle.plateNumber.trim() === '') &&
            (!vehicle?.color || vehicle.color.trim() === '') &&
            (!vehicle?.imageUrl || vehicle.imageUrl.trim() === '')
          ) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Vehicle not registered',
              isVehicle: false,
            });
          }

          const wayBillDocs = Object.values(driver.wayBill || {});
          if (
            wayBillDocs.length === 0 ||
            wayBillDocs.some((doc) => !doc.status || doc.status !== 'issued')
          ) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Way Bill not issued',
              isWayBill: false,
            });
          }

          const documentList = Object.values(driver.documents || {});
          if (
            documentList.length === 0 ||
            documentList.some((doc) => !doc.status || doc.status !== 'verified')
          ) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Documents not verified',
              isDocuments: false,
            });
          }

          const stats = await findDrivingHours(driver._id);
          if (stats.remainingHours < 3 && stats.remainingHours > 0) {
            socket.emit(driver.userId, 'driver:remaining_driving_hours', {
              success: true,
              objectType: 'remaining-driving-hours',
              data: stats,
              message: `Only ${stats.remainingHours} driving hours left.`,
            });
          } else if (stats.remainingHours <= 0) {
            return emitToUser(driver.userId, 'driver:remaining_driving_hours', {
              success: true,
              objectType: 'remaining-driving-hours',
              data: stats,
              message: `Your driving hours are finished`,
            });
          }

          let updatedDriver;
          if (driver.status === 'online') {
            updatedDriver = await updateDriverByUserId(userId, {
              isActive: false,
              status: 'offline',
            });
            await removeDriverLocation(driver._id);
            await toggleDriverLocation(driver._id, 'offline', false);
          } else if (driver.status === 'offline') {
            updatedDriver = await updateDriverByUserId(userId, {
              isActive: true,
              status: 'online',
            });
            await toggleDriverLocation(driver._id, 'online', true);
          } else {
            updatedDriver = driver;
          }
          socket.emit('driver:update_status', {
            success: true,
            objectType,
            data: updatedDriver,
            message: `Driver status set to ${updatedDriver.status} successfully`,
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

      socket.on('driver:status', async () => {
        if (!userId) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
          });
        }

        const objectType = 'driver-status';
        try {
          const driver = await findDriverByUserId(userId);
          if (!driver) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'NOT_FOUND',
              message: 'Driver not found',
            });
          }

          socket.emit('driver:status', {
            success: true,
            objectType,
            data: driver,
            message: `Driver fetched successfully`,
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
    }

    socket.on('ride:active', async () => {
      const objectType = 'active-ride';
      if (!userId) {
        return socket.emit('error', {
          success: false,
          objectType,
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        });
      }
      try {
        let user;
        if (['driver'].includes(socket.user.roles[0])) {
          user = await findDriverByUserId(userId);

          if (!user) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'NOT_FOUND',
              message: 'Driver not found',
            });
          }
        } else if (['passenger'].includes(socket.user.roles[0])) {
          user = await findPassengerByUserId(userId);

          if (!user) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'NOT_FOUND',
              message: 'Passenger not found',
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

    socket.on('share:ride_data', async ({ rideId }) => {
      const objectType = 'share-ride-data';
      try {
        const ride = await findRide(rideId);
        if (!ride) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'NOT_FOUND',
            message: 'Ride not found',
          });
        } else if (!ride.driverId) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Driver not found',
          });
        } else if (!ride.passengerId) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Passenger not found',
          });
        } else if (ride.status === 'RIDE_COMPLETED') {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Ride is completed',
          });
        } else if (ride.status === 'CANCELLED_BY_DRIVER') {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Ride is cancelled by driver',
          });
        } else if (ride.status === 'CANCELLED_BY_PASSENGER') {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Ride is cancelled by passenger',
          });
        } else if (ride.status === 'CANCELLED_BY_SYSTEM') {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Ride is cancelled by system',
          });
        } else if (ride.status === 'REQUESTED') {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Ride is requested',
          });
        }

        const driverLocation = await getDriverLocation(
          ride.driverId?._id.toString(),
        );
        if (!driverLocation) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Driver location not found',
          });
        }

        socket.emit('share:ride_data', {
          success: true,
          objectType,
          data: {
            ride,
            driverLocation: driverLocation || 'Driver Location not available',
          },
          message: 'Ride data shared successfully',
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

    // Driver Events
    socket.on('ride:find', async () => {
      const objectType = 'find-ride';
      if (!userId) {
        return socket.emit('error', {
          success: false,
          objectType,
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        });
      }

      try {
        const driver = await findDriverByUserId(userId);
        if (!driver) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'NOT_FOUND',
            message: 'Driver not found',
          });
        } else if (!driver.isActive) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Driver is not active',
          });
        } else if (driver.isRestricted) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Driver in restricted area',
          });
        } else if (driver.isBlocked) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Driver is blocked',
          });
        } else if (driver.isSuspended) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Driver is suspended',
          });
        } else if (driver.backgroundCheckStatus !== 'approved') {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Driver background not verified',
          });
        } else if (driver.status !== 'online') {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Driver is not online',
          });
        }

        const driverLocation = await getDriverLocation(driver._id);
        if (!driverLocation) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'NOT_FOUND',
            message: 'Driver location not found',
          });
        } else if (!driverLocation.isAvailable) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Driver not available',
          });
        }

        const availableRides = await findPendingRides(
          driver.vehicle.type,
          driverLocation.coordinates,
          10000,
          { driverId: driver._id }, // Exclude rides already assigned to this driver
        );

        socket.emit('ride:find', {
          success: true,
          objectType,
          data: availableRides,
          message: `${availableRides.length} available rides found`,
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

    socket.on('ride:find_airport_ride', async () => {
      const objectType = 'find-airport-ride';
      if (!userId) {
        return socket.emit('error', {
          success: false,
          objectType,
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        });
      }

      try {
        const driver = await findDriverByUserId(userId);
        if (!driver) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'NOT_FOUND',
            message: 'Driver not found',
          });
        } else if (!driver.isActive) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Driver is not active',
          });
        } else if (driver.isRestricted) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Driver in restricted area',
          });
        } else if (driver.isBlocked) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Driver is blocked',
          });
        } else if (driver.isSuspended) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Driver is suspended',
          });
        } else if (driver.backgroundCheckStatus !== 'approved') {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Driver background not verified',
          });
        } else if (driver.status !== 'online') {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Driver is not online',
          });
        }

        const driverLocation = await getDriverLocation(driver._id);
        if (!driverLocation) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'NOT_FOUND',
            message: 'Driver location not found',
          });
        } else if (!driverLocation.isAvailable) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Driver not available',
          });
        }

        // const [lng, lat] = driverLocation.coordinates;
        // const driverCoords = { latitude: lat, longitude: lng };

        const parkingLot = await isDriverInParkingLot(
          driverLocation.coordinates,
        );
        console.log('Parking Log: ', parkingLot);
        if (parkingLot) {
          const availableRides = await findPendingAirportRides(
            driver.vehicle.type,
            parkingLot._id,
          );

          console.log('Available Rides: ', availableRides);

          if (availableRides.length <= 0) {
            socket.emit('ride:find_airport_ride', {
              success: true,
              objectType,
              code: 'NOT_FOUND',
              message: `No airport ride available`,
            });
          }

          availableRides.forEach((ride) => offerRideToParkingQueue(ride, io));

          socket.emit('ride:find_airport_ride', {
            success: true,
            objectType,
            data: availableRides,
            message: `${availableRides.length} airport ride(s) available`,
          });
        } else {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: `Driver not in airport parking`,
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

    socket.on('ride:parking_queue', async () => {
      const objectType = 'parking-queue';
      if (!userId) {
        return socket.emit('error', {
          success: false,
          objectType,
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        });
      }
      try {
        const driver = await findDriverByUserId(userId);
        if (!driver) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'NOT_FOUND',
            message: 'Driver not found',
          });
        } else if (!driver.isActive) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Driver is not active',
          });
        } else if (driver.isRestricted) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Driver in restricted area',
          });
        } else if (driver.isBlocked) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Driver is blocked',
          });
        } else if (driver.isSuspended) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Driver is suspended',
          });
        } else if (driver.backgroundCheckStatus !== 'approved') {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Driver background not verified',
          });
        } else if (driver.status !== 'online') {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Driver is not online',
          });
        }

        const driverLocation = await getDriverLocation(driver._id);
        if (!driverLocation) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'NOT_FOUND',
            message: 'Driver location not found',
          });
        } else if (!driverLocation.isAvailable) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Driver not available',
          });
        } else if (!driverLocation.parkingQueueId) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Driver not in parking lot',
          });
        }

        const queue = await findParkingQueue(
          driver._id,
          driverLocation.parkingQueueId,
        );
        if (!queue.success) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'NOT_FOUND',
            message: 'Parking queue data not found',
          });
        }

        socket.emit('ride:parking_queue', {
          success: true,
          objectType,
          data: queue.data,
          message: 'Parking queue fetched successfully',
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
      if (!userId) {
        return socket.emit('error', {
          success: false,
          objectType,
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        });
      }

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
          return socket.emit('error', {
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
      if (!userId) {
        return socket.emit('error', {
          success: false,
          objectType,
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        });
      }

      try {
        const driver = await findDriverByUserId(userId);
        if (!driver) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'NOT_FOUND',
            message: 'Driver not found',
          });
        } else if (driver.isRestricted) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Driver is restricted',
          });
        } else if (driver.isBlocked) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Driver is blocked',
          });
        } else if (driver.isSuspended) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Driver is suspended',
          });
        } else if (driver.backgroundCheckStatus !== 'approved') {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Driver is backgound not verified',
          });
        } else if (driver.status !== 'online') {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Driver must be online',
          });
        }

        const driverLocation = await getDriverLocation(driver._id);
        if (!driverLocation) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'NOT_FOUND',
            message: 'Driver location not found',
          });
        } else if (!driverLocation.isAvailable) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Driver not available',
          });
        }

        const ride = await findRideById(rideId);
        if (!ride) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'NOT_FOUND',
            message: 'Ride not found',
          });
        } else if (ride.driverId?.toString() === driver._id.toString()) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Cannot decline a ride already assigned to you',
          });
        }

        if (ride.isAirport) {
          await handleDriverRideResponse(
            driver._id,
            rideId,
            false,
            driverLocation.parkingQueueId,
          );
        }

        // Fetch replacement rides
        const replacementRides = await findPendingRides(
          driver.vehicle.type,
          driverLocation.coordinates,
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
      if (!userId) {
        return socket.emit('error', {
          success: false,
          objectType,
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        });
      }

      try {
        const driver = await findDriverByUserId(userId);
        if (!driver) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'NOT_FOUND',
            message: 'Driver not found',
          });
        } else if (!driver.isActive) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Driver is not active',
          });
        } else if (driver.isRestricted) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Driver in restricted area',
          });
        } else if (driver.isBlocked || driver.status === 'blocked') {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Driver is blocked',
          });
        } else if (driver.isSuspended || driver.status === 'suspended') {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Driver is suspended',
          });
        } else if (driver.backgroundCheckStatus !== 'approved') {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Driver background not verified',
          });
        } else if (driver.status !== 'online') {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Driver is not online',
          });
        } else if (
          !driver.payoutMethodIds ||
          driver.payoutMethodIds.length <= 0
        ) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Payout method not found',
          });
        } else if (
          !driver.defaultAccountId ||
          driver.defaultAccountId.trim() === ''
        ) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Default Payout method not found',
          });
        }

        // Ensure driver documents (including license) and waybill are still valid
        const wayBillDocs = Object.values(driver.wayBill || {});
        if (
          wayBillDocs.length === 0 ||
          wayBillDocs.some((doc) => !doc.status || doc.status !== 'issued')
        ) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Way Bill not issued',
          });
        }

        const documentList = Object.values(driver.documents || {});
        if (
          documentList.length === 0 ||
          documentList.some((doc) => !doc.status || doc.status !== 'verified')
        ) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Documents not verified',
          });
        }

        const ride = await findRideById(rideId);
        if (!ride) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'NOT_FOUND',
            message: 'Ride not found',
          });
        } else if (ride.driverId) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Ride already assigned to another driver',
          });
        } else if (ride.status !== 'REQUESTED') {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'This ride is not available',
          });
        }

        const availability = await findDriverLocation(driver._id);
        if (!availability) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'NOT_FOUND',
            message: 'Driver location not found',
          });
        } else if (availability.isAvailable === false) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Driver not available',
          });
        } else if (availability.currentRideId) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Driver on another ride',
          });
        }

        let isDestinationRide = false;
        // Check if driver has active destination ride
        if (driver.destinationRide?.isActive || driver.isDestination) {
          const canAcceptDestinationRide = await checkDestinationRides(
            driver._id,
          );
          if (!canAcceptDestinationRide) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message:
                'Driver has reached the maximum number of destination rides for today (2 rides per day limit)',
            });
          }
          
          // Verify that passenger dropoff is within 10km of driver's destination
          if (driver.destinationRide?.isActive && driver.destinationRide?.endLocation?.coordinates) {
            const destCoords = driver.destinationRide.endLocation.coordinates;
            const dropoffCoords = ride.dropoffLocation?.coordinates;
            
            if (dropoffCoords && destCoords.length === 2 && dropoffCoords.length === 2) {
              const distance = haversineDistance(
                { latitude: destCoords[1], longitude: destCoords[0] },
                { latitude: dropoffCoords[1], longitude: dropoffCoords[0] },
              );
              
              if (distance <= 10) {
                isDestinationRide = true;
              } else {
                return socket.emit('error', {
                  success: false,
                  objectType,
                  code: 'FORBIDDEN',
                  message: 'This ride is not within 10km of your destination',
                });
              }
            }
          } else {
            // Backward compatibility: if isDestination is true but no destinationRide data
            isDestinationRide = true;
          }
        }

        const rideCoords = {
          longitude: ride.pickupLocation?.coordinates[0],
          latitude: ride.pickupLocation?.coordinates[1],
        };

        const driverCoords = {
          longitude: availability.location?.coordinates[0],
          latitude: availability.location?.coordinates[1],
        };

        const driverDistance = haversineDistance(rideCoords, driverCoords);
        console.log(driverDistance);
        if (!driverDistance) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Driver distance is not valid with in the search radius',
          });
        }

        const updatedRide = await updateRideById(ride._id, {
          status: 'DRIVER_ASSIGNED',
          driverId: driver._id,
          driverAssignedAt: new Date(),
          isDestinationRide,
          driverDistance,
        });
        if (!updatedRide) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Failed to update ride with driver assignment',
          });
        }
        await onRideAccepted(ride._id);

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
            status: 'CANCELLED_BY_SYSTEM',
            cancelledAt: new Date(),
            cancelledBy: 'system',
            cancellationReason: 'Failed to assign driver',
            driverDistance: 0,
            paymentStatus: 'CANCELLED',
          });
          await updateDriverAvailability(driver._id, true, null);
          await updateDriverByUserId(userId, {
            status: 'online',
          });
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Failed to accept ride',
          });
        }

        if (ride.isAirport) {
          await handleDriverRideResponse(
            updatedDriver._id,
            ride._id,
            true,
            updateAvailability.parkingQueueId,
          );
        }

        const [newDriver, newPassenger] = await Promise.all([
          findUserById(updatedRide.driverId?.userId),
          findUserById(updatedRide.passengerId?.userId),
        ]);

        const notifyDriver = await notifyUser({
          userId: newDriver.userId?._id,
          title: 'Ride Request Confirmed',
          message: `Your ride with ${newPassenger.userId?.name} is confirmed.`,
          module: 'ride',
          metadata: updatedRide,
          actionLink: 'ride:accept_ride',
          storeInDB: false,
        });
        const notifyPassenger = await notifyUser({
          userId: newPassenger.userId?._id,
          title: 'Ride Request Confirmed',
          message: `Your ride with ${newDriver.userId?.name} is confirmed.`,
          module: 'ride',
          metadata: updatedRide,
          actionLink: 'ride:accept_ride',
          storeInDB: false,
        });
        if (!notifyDriver || !notifyPassenger) {
          console.log('Failed to send notification');
        }

        emitToUser(newDriver.userId?._id, 'driver:status_updated', {
          success: true,
          objectType: 'status-updated',
          data: { status: newDriver.status },
          message: 'Status updated successfully.',
        });

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

    // Handler for driver to accept/claim a scheduled ride
    // This works for both:
    // 1. Rides already assigned to the driver (acknowledgement)
    // 2. Rides not yet assigned to any driver (driver claims the ride)
    socket.on('ride:accept_scheduled_ride', async ({ rideId }) => {
      const objectType = 'accept-scheduled-ride';
      if (!userId) {
        return socket.emit('error', {
          success: false,
          objectType,
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        });
      }

      try {
        const driver = await findDriverByUserId(userId);
        if (!driver) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'NOT_FOUND',
            message: 'Driver not found',
          });
        }

        // Validate driver can accept rides
        if (!driver.isActive) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Driver is not active',
          });
        }
        if (driver.isBlocked) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Driver is blocked',
          });
        }
        if (driver.isSuspended) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Driver is suspended',
          });
        }
        if (driver.backgroundCheckStatus !== 'approved') {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Driver background check not approved',
          });
        }

        // Ensure driver documents (including license) and waybill are still valid
        const wayBillDocs = Object.values(driver.wayBill || {});
        if (
          wayBillDocs.length === 0 ||
          wayBillDocs.some((doc) => !doc.status || doc.status !== 'issued')
        ) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Way Bill not issued',
          });
        }

        const documentList = Object.values(driver.documents || {});
        if (
          documentList.length === 0 ||
          documentList.some((doc) => !doc.status || doc.status !== 'verified')
        ) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Documents not verified',
          });
        }

        const ride = await findRideById(rideId);
        if (!ride) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'NOT_FOUND',
            message: 'Ride not found',
          });
        }

        // Validate this is a scheduled ride
        if (!ride.isScheduledRide) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'INVALID_REQUEST',
            message: 'This is not a scheduled ride',
          });
        }

        // Check ride status
        if (ride.status !== 'DRIVER_ASSIGNED' && ride.status !== 'SCHEDULED') {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'INVALID_STATUS',
            message: `Cannot accept a ride with status: ${ride.status}`,
          });
        }

        // Check if ride is already assigned to another driver
        if (ride.driverId && ride.driverId._id.toString() !== driver._id.toString()) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'This ride is already assigned to another driver',
          });
        }

        // Check vehicle type matches
        if (driver.vehicle?.type !== ride.carType) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: `Your vehicle type (${driver.vehicle?.type}) does not match the ride requirement (${ride.carType})`,
          });
        }

        let updatedRide = ride;
        let isNewAssignment = false;

        // If no driver assigned yet, assign this driver
        if (!ride.driverId) {
          isNewAssignment = true;
          
          // Update ride with driver assignment
          updatedRide = await updateRideById(rideId, {
            driverId: driver._id,
            status: 'DRIVER_ASSIGNED',
            driverAssignedAt: new Date(),
          });

          if (!updatedRide) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'SERVER_ERROR',
              message: 'Failed to assign driver to ride',
            });
          }

          console.log('✅ Driver accepted and assigned to scheduled ride', {
            rideId: ride._id.toString(),
            driverId: driver._id.toString(),
          });
        } else {
          console.log('✅ Driver acknowledged pre-assigned scheduled ride', {
            rideId: ride._id.toString(),
            driverId: driver._id.toString(),
          });
        }

        // Join the ride room
        socket.join(`ride:${updatedRide._id}`);

        // IMPORTANT: Set currentRideId in DriverLocation so passenger receives location updates
        try {
          await updateDriverAvailability(
            driver._id,
            false,
            updatedRide._id,
          );
          console.log('✅ Set currentRideId for scheduled ride', {
            rideId: updatedRide._id,
            driverId: driver._id,
          });
        } catch (locationError) {
          console.error('Failed to set currentRideId for scheduled ride', {
            rideId: updatedRide._id,
            driverId: driver._id,
            error: locationError.message,
          });
        }

        // Notify driver of successful acceptance
        socket.emit('ride:accept_scheduled_ride', {
          success: true,
          objectType,
          data: updatedRide,
          message: isNewAssignment 
            ? 'Scheduled ride accepted successfully' 
            : 'Scheduled ride acknowledged successfully',
        });

        // Get passenger info for notification
        const passengerUserId =
          updatedRide.passengerId?.userId?._id?.toString() ||
          updatedRide.passengerId?.userId?.toString();
        const driverName = driver.userId?.name || 'Your driver';

        // Notify passenger
        if (passengerUserId) {
          if (isNewAssignment) {
            // Check if scheduled time has already passed - if yes, activate the ride
            const scheduledTime = updatedRide.scheduledTime ? new Date(updatedRide.scheduledTime) : null;
            const now = new Date();
            const isScheduledTimePassed = scheduledTime && scheduledTime <= now;

            if (isScheduledTimePassed) {
              // Scheduled time has passed - activate the ride and notify passenger
              emitToUser(passengerUserId, 'ride:active', {
                success: true,
                objectType: 'active-ride',
                data: updatedRide,
                message: 'Your scheduled ride is now active',
              });

              // Automatically join passenger to ride room to receive location updates
              try {
                const passengerSocketIds = await getSocketIds(passengerUserId);
                const rideRoom = `ride:${updatedRide._id}`;
                
                for (const socketId of passengerSocketIds) {
                  const socket = io.sockets.sockets.get(socketId);
                  if (socket) {
                    socket.join(rideRoom);
                    console.log('✅ Auto-joined passenger to ride room', {
                      passengerUserId,
                      rideId: updatedRide._id,
                      socketId,
                    });
                  }
                }

                // Emit confirmation that passenger joined the room
                if (passengerSocketIds.length > 0) {
                  io.to(rideRoom).emit('ride:passenger_join_ride', {
                    success: true,
                    objectType: 'passenger-join-ride',
                    data: updatedRide,
                    message: 'Passenger automatically joined ride room',
                  });
                }
              } catch (joinError) {
                console.error('Failed to auto-join passenger to ride room', {
                  passengerUserId,
                  rideId: updatedRide._id,
                  error: joinError.message,
                });
              }

              await notifyUser({
                userId: passengerUserId,
                title: 'Scheduled Ride Started',
                message: `Your scheduled ride with ${driverName} is now active. Please be ready at the pickup location.`,
                module: 'ride',
                metadata: updatedRide,
              });

              // Also notify driver
              const driverUserId =
                updatedRide.driverId?.userId?._id?.toString() ||
                updatedRide.driverId?.userId?.toString() ||
                driver.userId?._id?.toString();
              
              if (driverUserId) {
                const passengerName = updatedRide.bookedFor === 'SOMEONE'
                  ? updatedRide.bookedForName
                  : updatedRide.passengerId?.userId?.name || 'Passenger';

                emitToUser(driverUserId, 'ride:active', {
                  success: true,
                  objectType: 'active-ride',
                  data: updatedRide,
                  message: 'Your scheduled ride is now active',
                });

                await notifyUser({
                  userId: driverUserId,
                  title: 'Scheduled Ride Started',
                  message: `Your scheduled ride with ${passengerName} is now active. Please proceed to the pickup location.`,
                  module: 'ride',
                  metadata: updatedRide,
                });
              }
            } else {
              // Scheduled time hasn't arrived yet - just notify of assignment
              emitToUser(passengerUserId, 'ride:scheduled_ride_accepted', {
                success: true,
                objectType: 'scheduled-ride-accepted',
                data: {
                  ride: updatedRide,
                  scheduledTime: updatedRide.scheduledTime?.toLocaleString('en-US', {
                    weekday: 'short',
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  }),
                  driverName,
                },
                message: `${driverName} has accepted your scheduled ride`,
              });

              await notifyUser({
                userId: passengerUserId,
                title: 'Driver Accepted Your Scheduled Ride',
                message: `${driverName} has accepted your scheduled ride. We'll notify you when it's time for pickup.`,
                module: 'ride',
                metadata: updatedRide,
                storeInDB: true,
                isPush: true,
              });
            }
          } else {
            // Driver acknowledged pre-assigned ride
            emitToUser(passengerUserId, 'ride:driver_acknowledged_scheduled_ride', {
              success: true,
              objectType: 'driver-acknowledged-scheduled-ride',
              data: updatedRide,
              message: `${driverName} has confirmed the scheduled ride assignment`,
            });

            await notifyUser({
              userId: passengerUserId,
              title: 'Driver Confirmed',
              message: `${driverName} has confirmed your scheduled ride. We'll notify you when it's time for pickup.`,
              module: 'ride',
              metadata: updatedRide,
              storeInDB: true,
              isPush: true,
            });
          }
        }
      } catch (error) {
        console.error(`SOCKET ERROR (accept_scheduled_ride): ${error}`);
        return socket.emit('error', {
          success: false,
          objectType,
          code: error.code || 'SOCKET_ERROR',
          message: `SOCKET ERROR: ${error.message}`,
        });
      }
    });

    socket.on('ride:driver_cancel_ride', async ({ rideId, reason }) => {
      const objectType = 'cancel-ride-driver';
      if (!userId) {
        return socket.emit('error', {
          success: false,
          objectType,
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        });
      }

      const session = await mongoose.startSession();
      try {
        const driver = await findDriverByUserId(userId);
        if (!driver) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'NOT_FOUND',
            message: 'Driver not found',
          });
        }

        // NOTE: Previously we enforced driver.status === 'on_ride' (then ['online','on_ride']).
        // For scheduled rides this was too strict and caused false FORBIDDEN errors.
        // We now TRUST that if the driver is authenticated and assigned to the ride,
        // they are allowed to mark themselves as arriving, so we skip status validation here.

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
            code: 'FORBIDDEN',
            message: 'Cannot cancel a ride not assigned to you',
          });
        } else if (ride.status === 'CANCELLED_BY_PASSENGER') {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Ride already cancelled by passenger',
          });
        } else if (ride.status === 'CANCELLED_BY_DRIVER') {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'You have already cancelled this ride',
          });
        } else if (ride.status === 'CANCELLED_BY_SYSTEM') {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Ride already cancelled by system',
          });
        } else if (ride.status === 'RIDE_COMPLETED') {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Cannot cancel a completed ride',
          });
        } else if (!ride.passengerId) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
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
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: `Cannot cancel ride. Current status: ${ride.status}`,
          });
        }

        if (!reason || reason.trim().length < 3 || reason.trim().length > 500) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
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
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
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
            code: 'FORBIDDEN',
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
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Failed to cancel ride',
          });
        } else if (updatedRide.status !== 'CANCELLED_BY_DRIVER') {
          await session.abortTransaction();
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Failed to update ride status',
          });
        }

        if (updatedRide.paymentIntentId) {
          try {
            const cancelResult = await cancelPaymentHold(
              updatedRide.paymentIntentId,
            );
            if (!cancelResult.success) {
              // Log error but don't fail the cancellation
              console.error(
                `Failed to cancel payment hold for ride ${updatedRide._id}:`,
                cancelResult.error,
              );
            }
          } catch (cancelError) {
            // Log error but don't fail the cancellation
            console.error(
              `Error cancelling payment hold for ride ${updatedRide._id}:`,
              cancelError,
            );
          }
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

        // await sendDriverRideCancellationEmail(
        //   mailTo.userId?.email,
        //   mailTo.userId?.name,
        // );

        const stats = await findDrivingHours(driver._id);
        if (stats.remainingHours < 3 && stats.remainingHours > 0) {
          socket.emit(driver.userId, 'driver:remaining_driving_hours', {
            success: true,
            objectType: 'remaining-driving-hours',
            data: stats,
            message: `Only ${stats.remainingHours} driving hours left.`,
          });
        }

        // Notify passenger of ride cancellation
        socket.join(`ride:${updatedRide._id}`);
        io.to(`ride:${updatedRide._id}`).emit('ride:driver_cancel_ride', {
          success: true,
          objectType,
          data: updatedRide,
          message: 'Ride cancelled by driver',
        });

        const [newDriver, newPassenger] = await Promise.all([
          findUserById(ride.driverId?.userId),
          findUserById(ride.passengerId?.userId),
        ]);

        const notifyDriver = await notifyUser({
          userId: newDriver.userId?._id,
          title: 'Ride Cancelled',
          message: `Ride cancelled successfully.`,
          module: 'ride',
          metadata: updatedRide,
          actionLink: 'ride:driver_cancel_ride',
          storeInDB: false,
        });
        const notifyPassenger = await notifyUser({
          userId: newPassenger.userId?._id,
          title: 'Driver Canceled Ride',
          message: `Your driver ${newDriver.userId?.name} canceled the trip.`,
          module: 'ride',
          metadata: updatedRide,
          actionLink: 'ride:driver_cancel_ride',
          storeInDB: false,
        });
        if (!notifyDriver || !notifyPassenger) {
          console.log('Failed to send notification');
        }

        emitToUser(newDriver.userId?._id, 'driver:status_updated', {
          success: true,
          objectType: 'status-updated',
          data: { status: newDriver.status },
          message: 'Status updated successfully.',
        });

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
      if (!userId) {
        return socket.emit('error', {
          success: false,
          objectType,
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        });
      }

      try {
        const driver = await findDriverByUserId(userId);
        if (!driver) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'NOT_FOUND',
            message: 'Driver not found',
          });
        }

        // NOTE: For scheduled rides this strict status check caused false
        // "Invalid driver status" errors. We trust that an authenticated,
        // assigned driver can mark themselves as arriving, so we no longer
        // enforce a specific driver.status here.

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
            code: 'FORBIDDEN',
            message: 'Cannot update a ride not assigned to you',
          });
        }

        if (ride.status !== 'DRIVER_ASSIGNED') {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: `Cannot mark as arriving. Current status: ${ride.status}`,
          });
        }

        const updatedRide = await updateRideById(ride._id, {
          status: 'DRIVER_ARRIVING',
          driverArrivingAt: new Date(),
        });
        if (!updatedRide) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Failed to update ride status',
          });
        }

        const [newDriver, newPassenger] = await Promise.all([
          findUserById(ride.driverId?.userId),
          findUserById(ride.passengerId?.userId),
        ]);

        const notifyPassenger = await notifyUser({
          userId: newPassenger.userId?._id,
          title: 'Driver En Route',
          message: `${newDriver.userId?.name} is on the way to pick you up.`,
          module: 'ride',
          metadata: updatedRide,
          actionLink: 'ride:driver_arriving',
          storeInDB: false,
        });
        if (!notifyPassenger) {
          console.log('Failed to send notification');
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
      if (!userId) {
        return socket.emit('error', {
          success: false,
          objectType,
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        });
      }

      try {
        const driver = await findDriverData(userId);
        if (!driver) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'NOT_FOUND',
            message: 'Driver not found',
          });
        } else if (driver.status !== 'on_ride') {
          console.error('[Invalid driver status] ride:driver_arrived', {
            driverId: driver._id?.toString(),
            userId: userId?.toString(),
            currentStatus: driver.status,
            expectedStatus: 'on_ride',
            rideId: rideId,
            objectType,
          });
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Invalid driver status',
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
            code: 'FORBIDDEN',
            message: 'Cannot update a ride not assigned to you',
          });
        }

        if (ride.status !== 'DRIVER_ARRIVING') {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: `Cannot mark as arrived. Current status: ${ride.status}`,
          });
        }

        const updatedRide = await updateRideById(ride._id, {
          status: 'DRIVER_ARRIVED',
          driverArrivedAt: new Date(),
        });
        if (!updatedRide) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Failed to update ride status',
          });
        }

        const [newDriver, newPassenger] = await Promise.all([
          findUserById(ride.driverId?.userId),
          findUserById(ride.passengerId?.userId),
        ]);

        const passengerUserId = newPassenger.userId?._id?.toString() || 
                                newPassenger.userId?._id || 
                                ride.passengerId?.userId;

        const notifyDriver = await notifyUser({
          userId: newDriver.userId?._id,
          title: 'Driver Arrived',
          message: `Ride pick up location is arrived.`,
          module: 'ride',
          metadata: updatedRide,
          actionLink: 'ride:driver_arrived',
          storeInDB: false,
        });
        const notifyPassenger = await notifyUser({
          userId: passengerUserId,
          title: 'Driver Arrived',
          message: `${newDriver.userId?.name} has arrived at pickup location.`,
          module: 'ride',
          metadata: updatedRide,
          actionLink: 'ride:driver_arrived',
          storeInDB: false,
        });
        if (!notifyDriver || !notifyPassenger) {
          console.log('Failed to send notification');
        }

        socket.join(`ride:${updatedRide._id}`);
        
        // Emit to ride room
        io.to(`ride:${ride._id}`).emit('ride:driver_arrived', {
          success: true,
          objectType,
          data: updatedRide,
          message: 'Ride status updated to DRIVER_ARRIVED',
        });

        // Also emit to passenger's personal room to ensure they receive the notification
        if (passengerUserId) {
          emitToUser(passengerUserId, 'ride:driver_arrived', {
            success: true,
            objectType,
            data: updatedRide,
            message: `${newDriver.userId?.name} has arrived at pickup location.`,
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

    socket.on('ride:driver_start_ride', async ({ rideId }) => {
      const objectType = 'driver-start-ride';
      if (!userId) {
        return socket.emit('error', {
          success: false,
          objectType,
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        });
      }

      try {
        const driver = await findDriverByUserId(userId);
        if (!driver) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'NOT_FOUND',
            message: 'Driver not found',
          });
        } else if (driver.status !== 'on_ride') {
          console.error('[Invalid driver status] ride:driver_start_ride', {
            driverId: driver._id?.toString(),
            userId: userId?.toString(),
            currentStatus: driver.status,
            expectedStatus: 'on_ride',
            rideId: rideId,
            objectType,
          });
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Invalid driver status',
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
            code: 'FORBIDDEN',
            message: 'Cannot update a ride not assigned to you',
          });
        }

        if (ride.status !== 'DRIVER_ARRIVED') {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: `Cannot start ride. Current status: ${ride.status}`,
          });
        }

        // Check if driver is within 100m of pickup location
        const driverLocation = await findDriverLocation(driver._id);
        if (!driverLocation || !driverLocation.location?.coordinates) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'NOT_FOUND',
            message: 'Driver location not found. Please enable location services.',
          });
        }

        const pickupCoords = ride.pickupLocation?.coordinates;
        if (!pickupCoords || pickupCoords.length !== 2) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Invalid pickup location',
          });
        }

        // Calculate distance between driver and pickup location
        const driverCoords = {
          latitude: driverLocation.location.coordinates[1],
          longitude: driverLocation.location.coordinates[0],
        };
        const pickupLocationCoords = {
          latitude: pickupCoords[1],
          longitude: pickupCoords[0],
        };

        const distanceToPickup = haversineDistance(driverCoords, pickupLocationCoords); // Distance in km
        const MAX_DISTANCE_TO_START = 0.1; // 100 meters = 0.1 km

        if (distanceToPickup > MAX_DISTANCE_TO_START) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: `You must be within 100m of pickup location to start the ride. Current distance: ${(distanceToPickup * 1000).toFixed(0)}m`,
          });
        }

        // Check if passenger is ready (optional - driver can start ride even if passenger hasn't marked ready)
        // But we'll notify driver if passenger hasn't marked ready yet
        const passengerReady = !!ride.passengerReadyAt;
        const driverArrivedAt = ride.driverArrivedAt ? new Date(ride.driverArrivedAt) : null;
        const timeSinceArrival = driverArrivedAt 
          ? Math.floor((Date.now() - driverArrivedAt.getTime()) / 1000) // seconds
          : 0;
        
        // Driver can start ride once within 100m (no time restriction)
        // Waiting charges will be calculated separately based on passenger ready status

        const updatedRide = await updateRideById(ride._id, {
          status: 'RIDE_STARTED',
          rideStartedAt: new Date(),
        });
        if (!updatedRide) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Failed to update ride status',
          });
        }

        const [newDriver, newPassenger] = await Promise.all([
          findUserById(ride.driverId?.userId),
          findUserById(ride.passengerId?.userId),
        ]);

        const passengerUserId = newPassenger.userId?._id?.toString() || 
                                newPassenger.userId?._id || 
                                ride.passengerId?.userId;

        const notifyDriver = await notifyUser({
          userId: newDriver.userId._id,
          title: 'Ride Started',
          message: `Ride started with ${newPassenger.userId?.name}.`,
          module: 'ride',
          metadata: updatedRide,
          actionLink: 'ride:driver_start_ride',
          storeInDB: false,
        });
        const notifyPassenger = await notifyUser({
          userId: passengerUserId,
          title: 'Ride Started',
          message: `Ride started with ${newDriver.userId?.name}.`,
          module: 'ride',
          metadata: updatedRide,
          actionLink: 'ride:driver_start_ride',
          storeInDB: false,
        });
        if (!notifyDriver || !notifyPassenger) {
          console.log('Failed to send notification');
        }

        socket.join(`ride:${updatedRide._id}`);
        
        // Emit to ride room
        io.to(`ride:${ride._id}`).emit('ride:driver_start_ride', {
          success: true,
          objectType,
          data: updatedRide,
          message: 'Ride status updated to RIDE_STARTED',
        });

        // Also emit to passenger's personal room to ensure they receive the notification
        if (passengerUserId) {
          emitToUser(passengerUserId, 'ride:driver_start_ride', {
            success: true,
            objectType,
            data: updatedRide,
            message: `Ride started with ${newDriver.userId?.name}.`,
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

    socket.on(
      'ride:driver_complete_ride',
      async ({ rideId, actualDistance, earlyCompleteReason }) => {
        const objectType = 'driver-complete-ride';
        if (!userId) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
          });
        }

        try {
          const driver = await findDriverByUserId(userId);
          if (!driver) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'NOT_FOUND',
              message: 'Driver not found',
            });
          } else if (
            driver.status !== 'on_ride' &&
            driver.status !== 'online'
          ) {
            console.error('[Invalid driver status] ride:driver_complete_ride', {
              driverId: driver._id?.toString(),
              userId: userId?.toString(),
              currentStatus: driver.status,
              expectedStatus: ['on_ride', 'online'],
              rideId: rideId,
              objectType,
            });
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Invalid driver status',
            });
          }

          if (earlyCompleteReason) {
            earlyCompleteReason = earlyCompleteReason.trim();
            if (earlyCompleteReason === '' || earlyCompleteReason.length <= 3) {
              return socket.emit('error', {
                success: false,
                objectType,
                code: 'FORBIDDEN',
                message:
                  'Early completion reason must not be empty and contain atleast 3 characters',
              });
            }
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
              code: 'FORBIDDEN',
              message: 'Cannot update a ride not assigned to you',
            });
          } else if (
            ride.status !== 'RIDE_STARTED' &&
            ride.status !== 'RIDE_IN_PROGRESS'
          ) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: `Cannot complete ride. Current status: ${ride.status}`,
            });
          }

          if (!actualDistance || actualDistance < 0) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: `Invalid Distance, Distance must be greater than 0 and positive`,
            });
          }

          const actualDuration = parseFloat(
            (
              (Date.now() - new Date(ride.driverAssignedAt).getTime()) /
              (1000 * 60)
            ).toFixed(2),
          );

          // Calculate waiting time based on passenger ready status
          // Waiting charges logic:
          // 1. If passenger was ready BEFORE driver arrived → No waiting charges
          // 2. If passenger marked ready AFTER driver arrived → Charge from arrival to ready time (after 2 min grace)
          // 3. If passenger never marked ready → Charge from arrival to ride start, minus 2 minutes grace period
          // Waiting charges are calculated per hour rate
          const driverArrivedAtTime = ride.driverArrivedAt ? new Date(ride.driverArrivedAt).getTime() : 0;
          const rideStartedAtTime = ride.rideStartedAt ? new Date(ride.rideStartedAt).getTime() : Date.now();
          const passengerReadyAtTime = ride.passengerReadyAt ? new Date(ride.passengerReadyAt).getTime() : null;
          
          const GRACE_PERIOD_SECONDS = 120; // 2 minutes (120 seconds) grace period before waiting charges start
          
          let waitingTime = 0;
          
          if (driverArrivedAtTime > 0) {
            if (passengerReadyAtTime) {
              // Passenger marked ready
              if (passengerReadyAtTime <= driverArrivedAtTime) {
                // Passenger was ready before driver arrived → No waiting charges
                waitingTime = 0;
              } else {
                // Passenger marked ready after driver arrived
                const totalWaitTime = (passengerReadyAtTime - driverArrivedAtTime) / 1000; // Convert to seconds
                // Charge only if waiting time exceeds 2 minutes grace period
                waitingTime = Math.max(0, totalWaitTime - GRACE_PERIOD_SECONDS);
              }
            } else {
              // Passenger never marked ready → Charge from arrival to ride start, minus 2 minutes grace period
              const totalWaitTime = (rideStartedAtTime - driverArrivedAtTime) / 1000; // Convert to seconds
              waitingTime = Math.max(0, totalWaitTime - GRACE_PERIOD_SECONDS);
            }
          }

          const carType = ride.driverId?.vehicle?.type;

          const fareResult = await calculateActualFare({
            carType,
            actualDistance,
            actualDuration,
            waitingTime,
            rideStartedAt: ride.rideStartedAt,
            surgeMultiplier: ride.fareBreakdown?.surgeMultiplier,
            fareConfig: ride.fareConfig,
          });

          const fare = parseFloat(fareResult.actualFare);

          const updatedRide = await updateRideById(ride._id, {
            status: 'RIDE_COMPLETED',
            rideCompletedAt: new Date(),
            paymentStatus: 'PROCESSING',
            actualFare: Math.floor(fare),
            actualDistance,
            actualDuration,
            actualWaitingTime: parseFloat((waitingTime / 60).toFixed(2)),
            fareBreakdown: fareResult.fareBreakdown,
            earlyCompleteReason: earlyCompleteReason
              ? earlyCompleteReason
              : null,
          });
          if (!updatedRide) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
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
              code: 'FORBIDDEN',
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
              code: 'FORBIDDEN',
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
              code: 'FORBIDDEN',
              message: 'Failed to update driver History',
            });
          }

          const stats = await findDrivingHours(driver._id);
          if (stats.remainingHours < 3 && stats.remainingHours > 0) {
            socket.emit(driver.userId, 'driver:remaining_driving_hours', {
              success: true,
              objectType: 'remaining-driving-hours',
              data: stats,
              message: `Only ${stats.remainingHours} driving hours left.`,
            });
          }

          const [newDriver, newPassenger] = await Promise.all([
            findUserById(ride.driverId?.userId),
            findUserById(ride.passengerId?.userId),
          ]);

          const notifyDriver = await notifyUser({
            userId: newDriver.userId?._id,
            title: 'Ride Completed',
            message: `Ride completed successfully`,
            module: 'ride',
            metadata: updatedRide,
            actionLink: 'ride:driver_complete_ride',
            storeInDB: false,
          });
          const notifyPassenger = await notifyUser({
            userId: newPassenger.userId?._id,
            title: 'Ride Completed',
            message: `Ride completed. Fare: $${updatedRide.actualFare}`,
            module: 'ride',
            metadata: updatedRide,
            actionLink: 'ride:driver_complete_ride',
            storeInDB: false,
          });
          if (!notifyDriver || !notifyPassenger) {
            console.log('Failed to send notification');
          }

          emitToUser(newDriver.userId?._id, 'driver:status_updated', {
            success: true,
            objectType: 'status-updated',
            data: { status: newDriver.status },
            message: 'Status updated successfully.',
          });

          socket.join(`ride:${updatedRide._id}`);
          
          // Emit to ride room (for all participants)
          io.to(`ride:${updatedRide._id}`).emit('ride:driver_complete_ride', {
            success: true,
            objectType,
            data: updatedRide,
            message: 'Ride status updated to RIDE_COMPLETED',
          });

          // Also emit directly to passenger's personal room to ensure they receive the notification
          // This is especially important for scheduled rides where passenger might not be actively in ride room
          const passengerUserId =
            updatedRide.passengerId?.userId?._id?.toString() ||
            updatedRide.passengerId?.userId?.toString() ||
            ride.passengerId?.userId;
          
          if (passengerUserId) {
            emitToUser(passengerUserId, 'ride:driver_complete_ride', {
              success: true,
              objectType,
              data: updatedRide,
              message: 'Ride completed successfully',
            });
          }

          // Trigger payment processing directly
          setImmediate(() => {
            processRidePayment(updatedRide._id);
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
        if (!userId) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
          });
        }

        try {
          const driver = await findDriverByUserId(userId);
          if (!driver) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'NOT_FOUND',
              message: 'Driver not found',
            });
          } else if (!['online', 'on_ride'].includes(driver.status)) {
            console.error('[Invalid driver status] ride:driver_rate_passenger', {
              driverId: driver._id?.toString(),
              userId: userId?.toString(),
              currentStatus: driver.status,
              expectedStatus: ['online', 'on_ride'],
              rideId: rideId,
              objectType,
            });
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Invalid driver status',
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
          }

          if (driverId.toString() !== driver._id.toString()) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Cannot rate passenger for a ride not assigned to you',
            });
          }

          if (ride.status !== 'RIDE_COMPLETED') {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: `Cannot rate passenger. Current ride status: ${ride.status}`,
            });
          }

          if (ride.passengerRating) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'You have already rated this passenger for this ride',
            });
          }

          if (typeof rating !== 'number' || rating < 1 || rating > 5) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Rating must be a number between 1 and 5',
            });
          }

          if (feedback && (feedback.length < 3 || feedback.length > 500)) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Feedback must be between 3 and 500 characters',
            });
          }

          let isApproved = true;
          if (rating < 5) {
            isApproved = false;
          }

          const payload = {
            passengerId: ride.passengerId,
            driverId: ride.driverId,
            rideId: ride._id,
            type: 'by_driver',
            rating,
            feedback,
            isApproved,
          };
          const driverFeedback = await createFeedback(payload);
          if (!driverFeedback) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Driver failed to send feedback for passenger',
            });
          }

          const updatedRide = await updateRideById(ride._id, {
            passengerRating: driverFeedback._id,
          });

          if (!updatedRide) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Failed to save passenger rating',
            });
          }

          // Notification Logic Start
          const [newDriver, newPassenger] = await Promise.all([
            findUserById(ride.driverId?.userId),
            findUserById(ride.passengerId?.userId),
          ]);

          const notifyDriver = await notifyUser({
            userId: newDriver.userId?._id,
            title: 'Passenger Rated',
            message: `You successfully rated the ride with ${newDriver.userId?.name}.`,
            module: 'ride',
            metadata: updatedRide,
            actionLink: 'ride:driver_rate_passenger',
            storeInDB: false,
          });
          const notifyPassenger = await notifyUser({
            userId: newPassenger.userId?._id,
            title: 'Rating Received',
            message: `You received a rating from ${newDriver.userId?.name}.`,
            module: 'ride',
            metadata: updatedRide,
            actionLink: 'ride:driver_rate_passenger',
            storeInDB: false,
          });
          if (!notifyDriver || !notifyPassenger) {
            console.log('Failed to send notification');
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
        if (!userId) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
          });
        }

        try {
          if (
            !location ||
            !Array.isArray(location.coordinates) ||
            location.coordinates.length !== 2 ||
            location.coordinates.some((c) => typeof c !== 'number')
          ) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message:
                'Location must be a GeoJSON Point [lng, lat] with valid numbers',
            });
          } else if (
            typeof speed !== 'number' ||
            !speed ||
            speed < 0 ||
            speed > 100
          ) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Speed must be greater 0 and less than 100',
            });
          } else if (
            !heading ||
            typeof heading !== 'number' ||
            heading > 360 ||
            heading < 0
          ) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Heading must be greater 0 and less than 360',
            });
          } else if (typeof isAvailable !== 'boolean') {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'isAvailable must be a boolean',
            });
          }

          const driver = await findDriverByUserId(userId);
          if (!driver) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'NOT_FOUND',
              message: 'Driver not found',
            });
          } else if (driver.isBlocked) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Driver is blocked',
            });
          } else if (driver.isSuspended) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Driver is suspended',
            });
          } else if (driver.backgroundCheckStatus !== 'approved') {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Driver background not verified',
            });
          } else if (!['online', 'on_ride'].includes(driver.status)) {
            console.error('[Invalid driver status] driver:update_location', {
              driverId: driver._id?.toString(),
              userId: userId?.toString(),
              currentStatus: driver.status,
              expectedStatus: ['online', 'on_ride'],
              objectType,
              isAvailable,
            });
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Invalid Driver Status',
            });
          } else if (!driver.isActive) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Driver is not active',
            });
          } else if (!driver.isApproved) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Driver is not approved',
            });
          }

          if (driver.status === 'on_ride' && isAvailable) {
            isAvailable = false;
          }

          if (driver.status === 'online') {
            // Get previous location state to detect entry/exit
            const previousLocation = await getDriverLocation(driver._id);
            const wasRestricted = previousLocation ? driver.isRestricted : false;
            const wasInParkingLot = previousLocation?.parkingQueueId ? true : false;

            const isRestricted = await isRideInRestrictedArea(
              location.coordinates,
            ); // returns boolean
            const isParkingLot = await isDriverInParkingLot(
              location.coordinates,
            );

            // ========== CONSOLE LOGS FOR AIRPORT TRACKING ==========
            console.log('\n' + '='.repeat(80));
            console.log('📍 DRIVER LOCATION UPDATE');
            console.log('='.repeat(80));
            console.log(`👤 Driver ID: ${driver._id}`);
            console.log(`👤 Driver Name: ${driver.userId?.name || 'N/A'}`);
            console.log(`⏰ Timestamp: ${new Date().toISOString()}`);
            console.log(`📍 Current Location:`);
            console.log(`   Longitude: ${location.coordinates[0]}`);
            console.log(`   Latitude: ${location.coordinates[1]}`);
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
              console.log(`   Entry Location: [${location.coordinates[0]}, ${location.coordinates[1]}]`);
            } else if (wasRestricted && !isRestricted) {
              console.log(`\n✅ EVENT: DRIVER EXITED AIRPORT RESTRICTED AREA`);
              console.log(`   Exit Time: ${new Date().toISOString()}`);
              console.log(`   Exit Location: [${location.coordinates[0]}, ${location.coordinates[1]}]`);
            }

            // Detect parking lot entry/exit
            if (!wasInParkingLot && isParkingLot) {
              console.log(`\n🅿️ EVENT: DRIVER ENTERED PARKING LOT`);
              console.log(`   Entry Time: ${new Date().toISOString()}`);
              console.log(`   Entry Location: [${location.coordinates[0]}, ${location.coordinates[1]}]`);
            } else if (wasInParkingLot && !isParkingLot) {
              console.log(`\n🚗 EVENT: DRIVER EXITED PARKING LOT`);
              console.log(`   Exit Time: ${new Date().toISOString()}`);
              console.log(`   Exit Location: [${location.coordinates[0]}, ${location.coordinates[1]}]`);
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

            if (isRestricted) {
              await updateDriverByUserId(userId, { isRestricted });
              const parkingLot = await findNearestParkingForPickup(
                location.coordinates,
              );

              await saveDriverLocation(driver._id, {
                lng: location.coordinates[0],
                lat: location.coordinates[1],
                status: driver.status,
                parkingQueueId: null,
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

              if (driverLocation) {
                socket.emit('ride:driver_update_location', {
                  success: true,
                  objectType,
                  data: parkingLot,
                  code: 'RESTRICTED_AREA',
                  message:
                    'You are inside the restricted area, and you are not allowed to pick ride in this area, reach to nearby parking lot to pick rides',
                });
              }
            } else if (isParkingLot) {
              console.log(`\n🅿️ PROCESSING: Adding driver to parking queue...`);
              
              let queue;
              const parkingQueue = await findDriverParkingQueue(
                isParkingLot._id,
              );
              if (parkingQueue) {
                queue = await addDriverToQueue(isParkingLot._id, driver._id);
                console.log(`✅ Driver added to queue. Queue Size: ${queue?.queueSize || 'N/A'}`);
                console.log(`   Queue Position: ${queue?.position || 'N/A'}`);
              } else {
                console.log(`⚠️ Parking queue not found for parking lot: ${isParkingLot._id}`);
              }

              await updateDriverByUserId(userId, { isRestricted: false });

              await saveDriverLocation(driver._id, {
                lng: location.coordinates[0],
                lat: location.coordinates[1],
                status: driver.status,
                parkingQueueId: parkingQueue ? parkingQueue._id : null,
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

              if (driverLocation) {
                socket.emit('ride:driver_update_location', {
                  success: true,
                  objectType,
                  data: queue,
                  code: 'PARKING_LOT',
                  message:
                    'You are within the premises of airport parking lot, You can pick rides now',
                });
              }
            } else {
              // Driver is outside airport area
              const currentLocation = await getDriverLocation(driver._id);
              if (
                currentLocation.parkingQueueId &&
                currentLocation.parkingQueueId !== null
              ) {
                console.log(`\n🚗 PROCESSING: Removing driver from parking queue (exited parking lot)...`);
                await removeDriverFromQueue(
                  driver._id,
                  currentLocation.parkingQueueId,
                );
                await updateDriverByUserId(userId, { isRestricted: false });
                console.log(`✅ Driver removed from parking queue`);
              }

              await saveDriverLocation(driver._id, {
                lng: location.coordinates[0],
                lat: location.coordinates[1],
                status: driver.status,
                parkingQueueId: null,
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
            }
          } else {
            const currentLocation = await getDriverLocation(driver._id);
            if (currentLocation.parkingQueueId) {
              await removeDriverFromQueue(
                driver._id,
                currentLocation.parkingQueueId,
              );
              await updateDriverByUserId(userId, { isRestricted: false });
            }

            await saveDriverLocation(driver._id, {
              lng: location.coordinates[0],
              lat: location.coordinates[1],
              status: driver.status,
              parkingQueueId: null,
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
          }
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
      if (!userId) {
        return socket.emit('error', {
          success: false,
          objectType,
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        });
      }

      const MAX_RIDES = 10;
      const MAX_RADIUS = 10;

      try {
        const driver = await findDriverByUserId(userId);

        if (!driver) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'NOT_FOUND',
            message: 'Driver not found',
          });
        } else if (driver.isRestricted) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Driver in restricted area',
          });
        } else if (driver.isBlocked) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Driver is blocked',
          });
        } else if (driver.isSuspended) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Driver is suspended',
          });
        } else if (driver.backgroundCheckStatus !== 'approved') {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Driver background not verified',
          });
        } else if (driver.status !== 'online') {
          console.error('[Invalid driver status] ride:find_destination_rides', {
            driverId: driver._id?.toString(),
            userId: userId?.toString(),
            currentStatus: driver.status,
            expectedStatus: 'online',
            objectType,
          });
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Invalid driver status',
          });
        }

        const [destination, driverLocation] = await Promise.all([
          findAllDestination(driver._id),
          getDriverLocation(driver._id),
        ]);

        if (!destination) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'You have no destination enabled',
          });
        }

        if (!driverLocation) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: "Driver's location is not available",
          });
        }

        const destCoords = destination.location.coordinates;
        const driverCoords = driverLocation.coordinates;
        const rides = await findNearbyRideRequests(
          destCoords,
          driverCoords,
          MAX_RADIUS,
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
      if (!userId) {
        return socket.emit('error', {
          success: false,
          objectType,
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        });
      }

      try {
        const driver = await findDriverByUserId(userId);
        if (!driver) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'NOT_FOUND',
            message: 'Driver not found',
          });
        } else if (driver.status !== 'on_ride') {
          console.error('[Invalid driver status] ride:driver_join_ride', {
            driverId: driver._id?.toString(),
            userId: userId?.toString(),
            currentStatus: driver.status,
            expectedStatus: 'on_ride',
            rideId: rideId,
            objectType,
          });
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Invalid driver status',
          });
        }

        const ride = await findRideByRideId(rideId);
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
            code: 'FORBIDDEN',
            message: 'Cannot join a ride not booked by you',
          });
        } else if (ride.status === 'CANCELLED_BY_PASSENGER') {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Ride already cancelled by you',
          });
        } else if (ride.status === 'CANCELLED_BY_DRIVER') {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Ride already cancelled by the driver',
          });
        } else if (ride.status === 'CANCELLED_BY_SYSTEM') {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Ride already cancelled by system',
          });
        } else if (
          ride.status === 'RIDE_COMPLETED' &&
          ride.paymentStatus === 'COMPLETED'
        ) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Cannot join a completed ride',
          });
        } else if (!ride.driverId) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Cannot join ride. No driver found',
          });
        } else if (ride.status === 'REQUESTED') {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
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
      if (!userId) {
        return socket.emit('error', {
          success: false,
          objectType,
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        });
      }

      try {
        const passenger = await findPassengerByUserId(userId);
        if (!passenger) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'NOT_FOUND',
            message: 'Passenger not found',
          });
        }

        const ride = await findRideByRideId(rideId);
        const passengerId = ride?.passengerId?._id;
        if (!ride) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'NOT_FOUND',
            message: 'Ride not found',
          });
        } else if (passengerId.toString() !== passenger._id.toString()) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Cannot join a ride not booked by you',
          });
        } else if (ride.status === 'CANCELLED_BY_PASSENGER') {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Ride already cancelled by you',
          });
        } else if (ride.status === 'CANCELLED_BY_DRIVER') {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Ride already cancelled by the driver',
          });
        } else if (ride.status === 'CANCELLED_BY_SYSTEM') {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Ride already cancelled by system',
          });
        } else if (
          ride.status === 'RIDE_COMPLETED' &&
          ride.paymentStatus === 'COMPLETED'
        ) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Cannot join a completed ride',
          });
        } else if (!ride.driverId) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Cannot join ride. No driver assigned yet',
          });
        } else if (ride.status === 'REQUESTED') {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
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
      const cancelStartTime = Date.now();
      
      console.log('🚫 [CANCELLATION] Passenger cancel ride request received', {
        userId,
        rideId,
        reason,
        timestamp: new Date().toISOString(),
      });
      
      if (!userId) {
        return socket.emit('error', {
          success: false,
          objectType,
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        });
      }

      const session = await mongoose.startSession();
      try {
        const passenger = await findPassengerByUserId(userId);
        if (!passenger) {
          console.error('❌ [CANCELLATION] Passenger not found', {
            userId,
            rideId,
            timestamp: new Date().toISOString(),
          });
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'NOT_FOUND',
            message: 'Passenger not found',
          });
        }

        const ride = await findRideById(rideId);
        const passengerId = ride?.passengerId?._id;
        if (!ride) {
          console.error('❌ [CANCELLATION] Ride not found', {
            userId,
            rideId,
            timestamp: new Date().toISOString(),
          });
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'NOT_FOUND',
            message: 'Ride not found',
          });
        } else if (passengerId.toString() !== passenger._id.toString()) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Cannot cancel a ride not booked by you',
          });
        } else if (ride.status === 'CANCELLED_BY_PASSENGER') {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Ride already cancelled by you',
          });
        } else if (ride.status === 'CANCELLED_BY_DRIVER') {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Ride already cancelled by the driver',
          });
        } else if (ride.status === 'CANCELLED_BY_SYSTEM') {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Ride already cancelled by system',
          });
        } else if (ride.status === 'RIDE_COMPLETED') {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Cannot cancel a completed ride',
          });
        }

        console.log('✅ [CANCELLATION] Ride found for cancellation', {
          userId,
          rideId,
          rideStatus: ride.status,
          isScheduledRide: ride.isScheduledRide,
          scheduledTime: ride.scheduledTime,
          hasDriver: !!ride.driverId,
          driverId: ride.driverId?._id || ride.driverId,
          passengerId: passengerId?.toString(),
          timestamp: new Date().toISOString(),
        });

        const cancellableStatuses = [
          'SCHEDULED', // Allow cancelling scheduled rides before they become active
          'REQUESTED',
          'DRIVER_ASSIGNED',
          'DRIVER_ARRIVING',
          'DRIVER_ARRIVED',
        ];
        if (!cancellableStatuses.includes(ride.status)) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: `Cannot cancel ride. Current status: ${ride.status}`,
          });
        }

        if (!reason || reason.trim().length < 3 || reason.trim().length > 500) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
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
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
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
              code: 'FORBIDDEN',
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
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Failed to cancel ride',
          });
        } else if (updatedRide.status !== 'CANCELLED_BY_PASSENGER') {
          await session.abortTransaction();
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Failed to update ride status',
          });
        }

        // Capture full payment on cancellation (user must pay full amount if they cancel)
        if (ride.paymentIntentId) {
          try {
            const estimatedFare = ride.estimatedFare || 0;
            console.log('💰 [CANCELLATION] Processing payment capture', {
              rideId: ride._id,
              paymentIntentId: ride.paymentIntentId,
              estimatedFare,
              timestamp: new Date().toISOString(),
            });
            
            if (estimatedFare > 0) {
              const captureResult = await captureFullPaymentOnCancellation(
                ride.paymentIntentId,
                estimatedFare,
                ride._id,
              );
              if (!captureResult.success) {
                // Log error but don't fail the cancellation
                console.error('❌ [CANCELLATION] Failed to capture full payment', {
                  rideId: ride._id,
                  paymentIntentId: ride.paymentIntentId,
                  error: captureResult.error,
                  timestamp: new Date().toISOString(),
                });
              } else {
                console.log('✅ [CANCELLATION] Full payment captured successfully', {
                  rideId: ride._id,
                  paymentIntentId: ride.paymentIntentId,
                  capturedAmount: captureResult.amount,
                  timestamp: new Date().toISOString(),
                });
              }
            }
          } catch (captureError) {
            // Log error but don't fail the cancellation
            console.error('❌ [CANCELLATION] Error capturing full payment', {
              rideId: ride._id,
              paymentIntentId: ride.paymentIntentId,
              error: captureError.message,
              stack: captureError.stack,
              timestamp: new Date().toISOString(),
            });
          }
        } else {
          console.log('ℹ️ [CANCELLATION] No payment intent to capture', {
            rideId: ride._id,
            timestamp: new Date().toISOString(),
          });
        }

        await onRideCancelled(updatedRide._id);

        // If this is a scheduled ride, remove scheduled jobs from queue
        if (ride.isScheduledRide) {
          try {
            const rideIdStr = ride._id.toString();
            const jobIds = [
              `scheduled-ride-notification-${rideIdStr}`,
              `scheduled-ride-activate-${rideIdStr}`,
              `scheduled-ride-cancel-${rideIdStr}`,
            ];

            console.log('🗑️ [CANCELLATION] Removing scheduled ride jobs from queue', {
              rideId: ride._id,
              jobIds,
              timestamp: new Date().toISOString(),
            });

            // Remove jobs from queue
            const removePromises = jobIds.map(async (jobId) => {
              try {
                const job = await scheduledRideQueue.getJob(jobId);
                if (job) {
                  await job.remove();
                  console.log('✅ [CANCELLATION] Removed scheduled ride job', {
                    rideId: ride._id,
                    jobId,
                    timestamp: new Date().toISOString(),
                  });
                  return { jobId, removed: true };
                } else {
                  console.log('ℹ️ [CANCELLATION] Scheduled ride job not found (may already be processed)', {
                    rideId: ride._id,
                    jobId,
                    timestamp: new Date().toISOString(),
                  });
                  return { jobId, removed: false, reason: 'not_found' };
                }
              } catch (removeError) {
                console.error('❌ [CANCELLATION] Failed to remove scheduled ride job', {
                  rideId: ride._id,
                  jobId,
                  error: removeError.message,
                  timestamp: new Date().toISOString(),
                });
                return { jobId, removed: false, error: removeError.message };
              }
            });

            const removeResults = await Promise.all(removePromises);
            const removedCount = removeResults.filter((r) => r.removed).length;

            console.log('✅ [CANCELLATION] Scheduled ride jobs removal completed', {
              rideId: ride._id,
              totalJobs: jobIds.length,
              removedCount,
              results: removeResults,
              timestamp: new Date().toISOString(),
            });
          } catch (queueError) {
            // Log error but don't fail the cancellation
            console.error('❌ [CANCELLATION] Error removing scheduled ride jobs from queue', {
              rideId: ride._id,
              error: queueError.message,
              stack: queueError.stack,
              timestamp: new Date().toISOString(),
            });
          }
        }

        await session.commitTransaction();
        
        const cancelTime = Date.now() - cancelStartTime;
        console.log('✅ [CANCELLATION] Ride cancelled successfully', {
          userId,
          rideId: ride._id,
          oldStatus: ride.status,
          newStatus: updatedRide.status,
          cancellationReason: reason,
          isScheduledRide: ride.isScheduledRide,
          processingTimeMs: cancelTime,
          timestamp: new Date().toISOString(),
        });

        const mailTo = await findUserById(ride.passengerId?.userId);
        if (!mailTo) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'NOT_FOUND',
            message: 'Passenger not found',
          });
        }

        // await sendPassengerRideCancellationWarningEmail(
        //   mailTo.userId?.email,
        //   mailTo.userId?.name,
        // );

        socket.join(`ride:${updatedRide._id}`);
        io.to(`ride:${updatedRide._id}`).emit('ride:passenger_cancel_ride', {
          success: true,
          objectType,
          data: updatedRide,
          message: 'Ride successfully cancelled by passenger',
        });

        // Notification Logic Start
        const [newDriver, newPassenger] = await Promise.all([
          findUserById(ride.driverId?.userId),
          findUserById(ride.passengerId?.userId),
        ]);

        const notifyDriver = await notifyUser({
          userId: newDriver.userId?._id,
          title: 'Passenger Canceled Ride',
          message: `Your passenger ${newPassenger.userId?.name} canceled the trip.`,
          module: 'ride',
          metadata: updatedRide,
          actionLink: 'ride:passenger_cancel_ride',
          storeInDB: false,
        });
        // Passenger notification disabled - passenger already knows they cancelled the ride
        // const notifyPassenger = await notifyUser({
        //   userId: newPassenger.userId?._id,
        //   title: 'Ride Cancelled',
        //   message: `Ride cancelled successfully.`,
        //   module: 'ride',
        //   metadata: updatedRide,
        //   actionLink: 'ride:passenger_cancel_ride',
        //   storeInDB: false,
        // });
        if (!notifyDriver) {
          console.log('Failed to send notification');
        }
        // Notification Logic End

        emitToUser(newDriver.userId?._id, 'driver:status_updated', {
          success: true,
          objectType: 'status-updated',
          data: { status: newDriver.status },
          message: 'Status updated successfully.',
        });

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

    socket.on('ride:passenger_ready', async ({ rideId }) => {
      const objectType = 'passenger-ready';
      if (!userId) {
        return socket.emit('error', {
          success: false,
          objectType,
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        });
      }

      try {
        const passenger = await findPassengerByUserId(userId);
        if (!passenger) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'NOT_FOUND',
            message: 'Passenger not found',
          });
        }

        const ride = await findRideById(rideId);
        const passengerId = ride?.passengerId?._id;
        if (!ride) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'NOT_FOUND',
            message: 'Ride not found',
          });
        } else if (passengerId.toString() !== passenger._id.toString()) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Cannot mark ready for a ride not booked by you',
          });
        } else if (
          ride.status === 'CANCELLED_BY_PASSENGER' ||
          ride.status === 'CANCELLED_BY_DRIVER' ||
          ride.status === 'CANCELLED_BY_SYSTEM' ||
          ride.status === 'RIDE_COMPLETED'
        ) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: `Cannot mark ready. Current ride status: ${ride.status}`,
          });
        } else if (ride.passengerReadyAt) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'You have already marked yourself as ready',
          });
        }

        const updatedRide = await updateRideById(ride._id, {
          passengerReadyAt: new Date(),
        });

        if (!updatedRide) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Failed to update ride status',
          });
        }

        // Notify driver and others in the ride room
        socket.join(`ride:${ride._id}`);
        io.to(`ride:${ride._id}`).emit('ride:passenger_ready', {
          success: true,
          objectType,
          data: updatedRide,
          message: 'Passenger marked as ready',
        });

        // Notify driver specifically
        if (ride.driverId?.userId) {
          await notifyUser({
            userId: ride.driverId.userId,
            title: 'Passenger Ready',
            message:
              'Your passenger has marked themselves as ready for the ride',
            module: 'ride',
            metadata: updatedRide,
            type: 'ALERT',
            actionLink: 'ride:passenger_ready',
            storeInDB: false,
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

    socket.on(
      'ride:passenger_rate_driver',
      async ({ rideId, rating, feedback }) => {
        const objectType = 'passenger-rate-driver';
        if (!userId) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
          });
        }

        try {
          const passenger = await findPassengerByUserId(userId);
          if (!passenger) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'NOT_FOUND',
              message: 'Passenger not found',
            });
          }

          const ride = await findRideById(rideId);
          const passengerId = ride?.passengerId?._id;
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
              code: 'FORBIDDEN',
              message: `Cannot rate driver. Current ride status: ${ride.status}`,
            });
          } else if (ride.driverRating) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'You have already rated this driver for this ride',
            });
          } else if (typeof rating !== 'number' || rating < 1 || rating > 5) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Rating must be a number between 1 and 5',
            });
          } else if (
            feedback &&
            (feedback.length < 3 || feedback.length > 500)
          ) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Feedback must be between 3 and 500 characters',
            });
          } else if (passengerId.toString() !== passenger._id.toString()) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Cannot rate driver for a ride not booked by you',
            });
          }

          let isApproved = true;
          if (rating < 5) {
            isApproved = false;
          }

          const payload = {
            passengerId: ride.passengerId,
            driverId: ride.driverId,
            rideId: ride._id,
            type: 'by_passenger',
            rating,
            feedback,
            isApproved,
          };
          const passengerFeedback = await createFeedback(payload);
          if (!passengerFeedback) {
            return socket.emit('ride:driver_rate_passenger', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Passenger failed to send feedback for driver',
            });
          }

          const updatedRide = await updateRideById(ride._id, {
            driverRating: passengerFeedback._id,
          });

          if (!updatedRide) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
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

    socket.on(
      'ride:tip_driver',
      async ({ rideId, percent, isApplied, paymentMethodId }) => {
        const objectType = 'tip-driver';
        if (!userId) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
          });
        }

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
              code: 'FORBIDDEN',
              message: `Cannot tip driver. Current ride status: ${ride.status}`,
            });
          } else if (ride.tipBreakdown?.isApplied) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: `You have already paid $${ride.tipBreakdown?.amount} which is ${ride.tipBreakdown?.percent}% of fare`,
            });
          } else if (
            isApplied !== true ||
            !percent ||
            percent <= 0 ||
            percent > 100
          ) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: `Tip percentage must be between 1 and 100`,
            });
          }

          // Calculate tip amount: (fare * percent) / 100
          const fare = ride.actualFare || ride.estimatedFare || 0;
          if (!fare || fare <= 0) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: `Invalid fare amount. Cannot calculate tip`,
            });
          }

          const amount = Math.floor((fare * percent) / 100);
          if (amount <= 0) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: `Tip amount must be greater than 0`,
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

          // Validate payment method ID for card payments
          let finalPaymentMethodId = paymentMethodId;
          if (
            ride.paymentMethod === 'CARD' ||
            ride.paymentMethod === 'GOOGLE_PAY' ||
            ride.paymentMethod === 'APPLE_PAY'
          ) {
            if (!finalPaymentMethodId) {
              // Try to get payment method ID from ride or passenger
              // But NEVER use ride.paymentMethod as fallback (it's just a string like 'CARD')
              finalPaymentMethodId = ride.cardId || passenger.defaultCardId || ride.paymentMethodId;
            }
            
            // Validate that we have an actual payment method ID (starts with 'pm_')
            if (!finalPaymentMethodId || !finalPaymentMethodId.startsWith('pm_')) {
              return socket.emit('error', {
                success: false,
                objectType,
                code: 'FORBIDDEN',
                message: `Valid payment method ID is required for card payments. Payment method type: ${ride.paymentMethod}`,
              });
            }
          }

          socket.join(`ride:${ride._id}`);

          // Transfer tip directly to driver's external account
          const tipResult = await transferTipToDriverExternalAccount(
            passenger,
            driver,
            ride,
            amount,
            ride.paymentMethod,
            finalPaymentMethodId,
          );

          if (!tipResult.success) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: tipResult.error || 'Failed to transfer tip to driver',
            });
          }

          // Update ride with tip breakdown information
          const updatedRide = await updateRideById(ride._id, {
            tipBreakdown: {
              amount,
              percent,
              isApplied: true,
            },
          });

          if (!updatedRide) {
            console.error('Failed to update ride with tip breakdown');
          }

          // Emit success response
          io.to(`ride:${ride._id}`).emit('ride:tip_driver', {
            success: true,
            objectType,
            data: {
              ride: updatedRide || ride,
              tipAmount: amount,
              tipPercent: percent,
              payoutId: tipResult.payoutId,
              transferId: tipResult.transferId,
              paymentIntentId: tipResult.paymentIntentId,
            },
            message: "Tip successfully transferred to driver's bank account",
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

    socket.on('ride:pay_driver', async ({ rideId }) => {
      const objectType = 'pay-driver';
      if (!userId) {
        return socket.emit('error', {
          success: false,
          objectType,
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        });
      }

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
            code: 'FORBIDDEN',
            message: `Cannot rate driver. Current ride status: ${ride.status}`,
          });
        } else if (!ride.actualFare || ride.actualFare <= 0) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: `Actual fare must be greter than 0`,
          });
        } else if (ride.paymentStatus === 'COMPLETED') {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
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

        // Process payment using the helper function
        const result = await processRidePayment(rideId);
        if (!result || !result.success) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: result?.error || 'Failed to process payment',
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

    // Chat Events
    socket.on('ride:get_chat', async ({ rideId }) => {
      const objectType = 'ride-chat';
      if (!userId) {
        return socket.emit('error', {
          success: false,
          objectType,
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        });
      }

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
            code: 'FORBIDDEN',
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
            code: 'FORBIDDEN',
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
        if (!userId) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
          });
        }

        try {
          let sender;
          let role;
          if (socket.user.roles.includes('driver')) {
            sender = await findDriverByUserId(userId);
            role = 'driver';

            if (!sender) {
              return socket.emit('error', {
                success: false,
                objectType,
                code: 'NOT_FOUND',
                message: 'Driver not found',
              });
            } else if (sender.isBlocked) {
              return socket.emit('error', {
                success: false,
                objectType,
                code: 'FORBIDDEN',
                message: 'Driver is blocked',
              });
            } else if (sender.isSuspended) {
              return socket.emit('error', {
                success: false,
                objectType,
                code: 'FORBIDDEN',
                message: 'Driver is suspended',
              });
            } else if (sender.backgroundCheckStatus !== 'approved') {
              return socket.emit('error', {
                success: false,
                objectType,
                code: 'FORBIDDEN',
                message: 'Driver background not verified',
              });
            } else if (!['online', 'on_ride'].includes(sender.status)) {
              console.error('[Invalid driver status] ride:send_message (driver)', {
                driverId: sender._id?.toString(),
                userId: userId?.toString(),
                currentStatus: sender.status,
                expectedStatus: ['online', 'on_ride'],
                rideId: rideId,
                objectType,
              });
              return socket.emit('error', {
                success: false,
                objectType,
                code: 'FORBIDDEN',
                message: 'Invalid driver status',
              });
            }
          } else if (socket.user.roles.includes('passenger')) {
            sender = await findPassengerByUserId(userId);
            role = 'passenger';

            if (!sender) {
              return socket.emit('error', {
                success: false,
                objectType,
                code: 'NOT_FOUND',
                message: 'Passenger not found',
              });
            } else if (sender.isBlocked) {
              return socket.emit('error', {
                success: false,
                objectType,
                code: 'FORBIDDEN',
                message: 'Passenger is blocked',
              });
            } else if (sender.isSuspended) {
              return socket.emit('error', {
                success: false,
                objectType,
                code: 'FORBIDDEN',
                message: 'Passenger is suspended',
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
              code: 'FORBIDDEN',
              message: 'Failed to send message',
            });
          }

          const receiverId =
            role === 'driver'
              ? ride.passengerId?.userId
              : ride.driverId?.userId;

          // Notification Logic Start
          const notify = await notifyUser({
            userId: receiverId,
            title:
              role === 'driver' ? 'Your Driver Wants to Chat' : 'New Message',
            message:
              role === 'driver'
                ? `Your driver has sent you a message. Open the chat to respond quickly.`
                : `Your Passenger just sent you a message.`,
            module: 'chat',
            metadata: updatedChat,
            type: 'ALERT',
            actionLink: `ride:get_chat`,
            storeInDB: false,
          });
          if (!notify) {
            console.error('Failed to send notification');
          }
          // Notification Logic End

          socket.to(`user:${receiverId}`).emit('chat:new_message', {
            success: true,
            objectType,
            data: newMsg,
            message: `${role === 'driver' ? 'Your Driver' : 'Your Passenger'} has sent you a message`,
          });

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
      if (!userId) {
        return socket.emit('error', {
          success: false,
          objectType,
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        });
      }

      try {
        let reader;
        if (socket.user.roles.includes('driver')) {
          reader = await findDriverByUserId(userId);

          if (!reader) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'NOT_FOUND',
              message: 'Driver not found',
            });
          } else if (reader.isBlocked) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Driver is blocked',
            });
          } else if (reader.isSuspended) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Driver is suspended',
            });
          } else if (reader.backgroundCheckStatus !== 'approved') {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Driver background not verified',
            });
          } else if (!['online', 'on_ride'].includes(reader.status)) {
            console.error('[Invalid driver status] ride:read_messages (driver)', {
              driverId: reader._id?.toString(),
              userId: userId?.toString(),
              currentStatus: reader.status,
              expectedStatus: ['online', 'on_ride'],
              rideId: rideId,
              objectType,
            });
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Invalid driver status',
            });
          }
        } else if (socket.user.roles.includes('passenger')) {
          reader = await findPassengerByUserId(userId);

          if (!reader) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'NOT_FOUND',
              message: 'Passenger not found',
            });
          } else if (reader.isBlocked) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Passenger is blocked',
            });
          } else if (reader.isSuspended) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Passenger is suspended',
            });
          }
        }

        const isRead = await markAllRideMessagesAsRead(rideId, reader.userId);
        if (!isRead.modifiedCount && isRead.modifiedCount < 0) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
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
      if (!userId) {
        return socket.emit('error', {
          success: false,
          objectType,
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        });
      }

      try {
        let sender;
        if (socket.user.roles.includes('driver')) {
          sender = await findDriverByUserId(userId);

          if (!sender) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'NOT_FOUND',
              message: 'Driver not found',
            });
          } else if (sender.isBlocked) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Driver is blocked',
            });
          } else if (sender.isSuspended) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Driver is suspended',
            });
          } else if (sender.backgroundCheckStatus !== 'approved') {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Driver background not verified',
            });
          } else if (!['online', 'on_ride'].includes(sender.status)) {
            console.error('[Invalid driver status] ride:edit_message (driver)', {
              driverId: sender._id?.toString(),
              userId: userId?.toString(),
              currentStatus: sender.status,
              expectedStatus: ['online', 'on_ride'],
              messageId: messageId,
              objectType,
            });
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Invalid driver status',
            });
          }
        } else if (socket.user.roles.includes('passenger')) {
          sender = await findPassengerByUserId(userId);

          if (!sender) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'NOT_FOUND',
              message: 'Passenger not found',
            });
          } else if (sender.isBlocked) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Passenger is blocked',
            });
          } else if (sender.isSuspended) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Passenger is suspended',
            });
          }
          as;
        }

        const updatedMsg = await editMessage(messageId, sender.userId, text);
        if (!updatedMsg) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
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
        if (!userId) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
          });
        }

        try {
          let sender;
          if (socket.user.roles.includes('driver')) {
            sender = await findDriverByUserId(userId);

            if (!sender) {
              return socket.emit('error', {
                success: false,
                objectType,
                code: 'NOT_FOUND',
                message: 'Driver not found',
              });
            } else if (sender.isBlocked) {
              return socket.emit('error', {
                success: false,
                objectType,
                code: 'FORBIDDEN',
                message: 'Driver is blocked',
              });
            } else if (sender.isSuspended) {
              return socket.emit('error', {
                success: false,
                objectType,
                code: 'FORBIDDEN',
                message: 'Driver is suspended',
              });
            } else if (sender.backgroundCheckStatus !== 'approved') {
              return socket.emit('error', {
                success: false,
                objectType,
                code: 'FORBIDDEN',
                message: 'Driver background not verified',
              });
            } else if (!['online', 'on_ride'].includes(sender.status)) {
              console.error('[Invalid driver status] ride:reply_message (driver)', {
                driverId: sender._id?.toString(),
                userId: userId?.toString(),
                currentStatus: sender.status,
                expectedStatus: ['online', 'on_ride'],
                rideId: rideId,
                messageId: messageId,
                objectType,
              });
              return socket.emit('error', {
                success: false,
                objectType,
                code: 'FORBIDDEN',
                message: 'Invalid driver status',
              });
            }
          } else if (socket.user.roles.includes('passenger')) {
            sender = await findPassengerByUserId(userId);

            if (!sender) {
              return socket.emit('error', {
                success: false,
                objectType,
                code: 'NOT_FOUND',
                message: 'Passenger not found',
              });
            } else if (sender.isBlocked) {
              return socket.emit('error', {
                success: false,
                objectType,
                code: 'FORBIDDEN',
                message: 'Passenger is blocked',
              });
            } else if (sender.isSuspended) {
              return socket.emit('error', {
                success: false,
                objectType,
                code: 'FORBIDDEN',
                message: 'Passenger is suspended',
              });
            }
          }

          if (!rideId) {
            socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Ride Id is required',
            });
          } else if (!text || text.trim().length === 0) {
            socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Empty message is not allowed',
            });
          } else if (
            !['text', 'system', 'location', 'image'].includes(messageType)
          ) {
            socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
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
              code: 'NOT_FOUND',
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
              code: 'FORBIDDEN',
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
      if (!userId) {
        return socket.emit('error', {
          success: false,
          objectType,
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        });
      }

      try {
        let sender;
        if (socket.user.roles.includes('driver')) {
          sender = await findDriverByUserId(userId);

          if (!sender) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'NOT_FOUND',
              message: 'Driver not found',
            });
          } else if (sender.isBlocked) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Driver is blocked',
            });
          } else if (sender.isSuspended) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Driver is suspended',
            });
          } else if (sender.backgroundCheckStatus !== 'approved') {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Driver background not verified',
            });
          } else if (!['online', 'on_ride'].includes(sender.status)) {
            console.error('[Invalid driver status] ride:delete_message (driver)', {
              driverId: sender._id?.toString(),
              userId: userId?.toString(),
              currentStatus: sender.status,
              expectedStatus: ['online', 'on_ride'],
              messageId: messageId,
              objectType,
            });
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Invalid driver status',
            });
          }
        } else if (socket.user.roles.includes('passenger')) {
          sender = await findPassengerByUserId(userId);

          if (!sender) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'NOT_FOUND',
              message: 'Passenger not found',
            });
          } else if (sender.isBlocked) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Passenger is blocked',
            });
          } else if (sender.isSuspended) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Passenger is suspended',
            });
          }
        }

        const deletedMsg = await deleteMessage(messageId, sender.userId);
        if (!deletedMsg.acknowledged) {
          return socket.emit('ride:delete_message', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
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
        if (!userId) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
          });
        }

        try {
          let caller;
          let role;
          if (socket.user.roles.includes('driver')) {
            caller = await findDriverByUserId(userId);
            role = 'driver';

            if (!caller) {
              return socket.emit('error', {
                success: false,
                objectType,
                code: 'NOT_FOUND',
                message: 'Driver not found',
              });
            } else if (caller.isBlocked) {
              return socket.emit('error', {
                success: false,
                objectType,
                code: 'FORBIDDEN',
                message: 'Driver is blocked',
              });
            } else if (caller.isSuspended) {
              return socket.emit('error', {
                success: false,
                objectType,
                code: 'FORBIDDEN',
                message: 'Driver is suspended',
              });
            } else if (caller.backgroundCheckStatus !== 'approved') {
              return socket.emit('error', {
                success: false,
                objectType,
                code: 'FORBIDDEN',
                message: 'Driver background not verified',
              });
            } else if (!['online', 'on_ride'].includes(caller.status)) {
              console.error('[Invalid driver status] ride:start_call (driver)', {
                driverId: caller._id?.toString(),
                userId: userId?.toString(),
                currentStatus: caller.status,
                expectedStatus: ['online', 'on_ride'],
                rideId: rideId,
                callType,
                objectType,
              });
              return socket.emit('error', {
                success: false,
                objectType,
                code: 'FORBIDDEN',
                message: 'Invalid driver status',
              });
            }
          } else if (socket.user.roles.includes('passenger')) {
            caller = await findPassengerByUserId(userId);
            role = 'passenger';

            if (!caller) {
              return socket.emit('error', {
                success: false,
                objectType,
                code: 'NOT_FOUND',
                message: 'Passenger not found',
              });
            } else if (caller.isBlocked) {
              return socket.emit('error', {
                success: false,
                objectType,
                code: 'FORBIDDEN',
                message: 'Passenger is blocked',
              });
            } else if (caller.isSuspended) {
              return socket.emit('error', {
                success: false,
                objectType,
                code: 'FORBIDDEN',
                message: 'Passenger is suspended',
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
              code: 'FORBIDDEN',
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
              code: `FORBIDDEN`,
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
                code: 'FORBIDDEN',
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
                code: 'FORBIDDEN',
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
      if (!userId) {
        return socket.emit('error', {
          success: false,
          objectType,
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        });
      }

      try {
        let receiver;
        let role;
        if (socket.user.roles.includes('driver')) {
          receiver = await findDriverByUserId(userId);
          role = 'driver';

          if (!receiver) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'NOT_FOUND',
              message: 'Driver not found',
            });
          } else if (receiver.isBlocked) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Driver is blocked',
            });
          } else if (receiver.isSuspended) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Driver is suspended',
            });
          } else if (receiver.backgroundCheckStatus !== 'approved') {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Driver background not verified',
            });
          } else if (!['online', 'on_ride'].includes(receiver.status)) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Invalid driver status',
            });
          }
        } else if (socket.user.roles.includes('passenger')) {
          receiver = await findPassengerByUserId(userId);
          role = 'passenger';

          if (!receiver) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'NOT_FOUND',
              message: 'Passenger not found',
            });
          } else if (receiver.isBlocked) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Passenger is blocked',
            });
          } else if (receiver.isSuspended) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Passenger is suspended',
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
            code: `FORBIDDEN`,
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
            code: 'FORBIDDEN',
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
            code: 'FORBIDDEN',
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
      if (!userId) {
        return socket.emit('error', {
          success: false,
          objectType,
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        });
      }

      try {
        let receiver;
        let role;
        if (socket.user.roles.includes('driver')) {
          receiver = await findDriverByUserId(userId);
          role = 'driver';

          if (!receiver) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'NOT_FOUND',
              message: 'Driver not found',
            });
          } else if (receiver.isBlocked) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Driver is blocked',
            });
          } else if (receiver.isSuspended) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Driver is suspended',
            });
          } else if (receiver.backgroundCheckStatus !== 'approved') {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Driver background not verified',
            });
          } else if (!['online', 'on_ride'].includes(receiver.status)) {
            console.error('[Invalid driver status] ride:decline_call (driver)', {
              driverId: receiver._id?.toString(),
              userId: userId?.toString(),
              currentStatus: receiver.status,
              expectedStatus: ['online', 'on_ride'],
              callLogId: callLogId,
              objectType,
            });
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Invalid driver status',
            });
          }
        } else if (socket.user.roles.includes('passenger')) {
          receiver = await findPassengerByUserId(userId);
          role = 'passenger';

          if (!receiver) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'NOT_FOUND',
              message: 'Passenger not found',
            });
          } else if (receiver.isBlocked) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Passenger is blocked',
            });
          } else if (receiver.isSuspended) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Passenger is suspended',
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
            code: `FORBIDDEN`,
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
            code: 'FORBIDDEN',
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
            code: 'FORBIDDEN',
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
            code: 'FORBIDDEN',
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
      if (!userId) {
        return socket.emit('error', {
          success: false,
          objectType,
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        });
      }

      try {
        let caller;
        let role;
        if (socket.user.roles.includes('driver')) {
          caller = await findDriverByUserId(userId);
          role = 'driver';

          if (!caller) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'NOT_FOUND',
              message: 'Driver not found',
            });
          } else if (caller.isBlocked) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Driver is blocked',
            });
          } else if (caller.isSuspended) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Driver is suspended',
            });
          } else if (caller.backgroundCheckStatus !== 'approved') {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Driver background not verified',
            });
          } else if (!['online', 'on_ride'].includes(caller.status)) {
            console.error('[Invalid driver status] ride:cancel_call (driver)', {
              driverId: caller._id?.toString(),
              userId: userId?.toString(),
              currentStatus: caller.status,
              expectedStatus: ['online', 'on_ride'],
              callLogId: callLogId,
              objectType,
            });
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Invalid driver status',
            });
          }
        } else if (socket.user.roles.includes('passenger')) {
          caller = await findPassengerByUserId(userId);
          role = 'passenger';

          if (!caller) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'NOT_FOUND',
              message: 'Passenger not found',
            });
          } else if (caller.isBlocked) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Passenger is blocked',
            });
          } else if (caller.isSuspended) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Passenger is suspended',
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
            code: `FORBIDDEN`,
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
            code: 'FORBIDDEN',
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
            code: 'FORBIDDEN',
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
            code: 'FORBIDDEN',
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
      if (!userId) {
        return socket.emit('error', {
          success: false,
          objectType,
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        });
      }

      try {
        let member;
        let role;
        if (socket.user.roles.includes('driver')) {
          member = await findDriverByUserId(userId);
          role = 'driver';

          if (!member) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'NOT_FOUND',
              message: 'Driver not found',
            });
          } else if (member.isBlocked) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Driver is blocked',
            });
          } else if (member.isSuspended) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Driver is suspended',
            });
          } else if (member.backgroundCheckStatus !== 'approved') {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Driver background not verified',
            });
          } else if (!['online', 'on_ride'].includes(member.status)) {
            console.error('[Invalid driver status] ride:end_call (driver)', {
              driverId: member._id?.toString(),
              userId: userId?.toString(),
              currentStatus: member.status,
              expectedStatus: ['online', 'on_ride'],
              callLogId: callLogId,
              objectType,
            });
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Invalid driver status',
            });
          }
        } else if (socket.user.roles.includes('passenger')) {
          member = await findPassengerByUserId(userId);
          role = 'passenger';

          if (!member) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'NOT_FOUND',
              message: 'Passenger not found',
            });
          } else if (member.isBlocked) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Passenger is blocked',
            });
          } else if (member.isSuspended) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Passenger is suspended',
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
            code: `FORBIDDEN`,
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
            code: 'FORBIDDEN',
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
            code: 'FORBIDDEN',
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
      if (!userId) {
        return socket.emit('error', {
          success: false,
          objectType,
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        });
      }

      try {
        let member;
        let role;
        if (socket.user.roles.includes('driver')) {
          member = await findDriverByUserId(userId);
          role = 'driver';

          if (!member) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'NOT_FOUND',
              message: 'Driver not found',
            });
          } else if (member.isBlocked) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Driver is blocked',
            });
          } else if (member.isSuspended) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Driver is suspended',
            });
          } else if (member.backgroundCheckStatus !== 'approved') {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Driver background not verified',
            });
          } else if (!['online', 'on_ride'].includes(member.status)) {
            console.error('[Invalid driver status] ride:join_call (driver)', {
              driverId: member._id?.toString(),
              userId: userId?.toString(),
              currentStatus: member.status,
              expectedStatus: ['online', 'on_ride'],
              callLogId: callLogId,
              objectType,
            });
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Invalid driver status',
            });
          }
        } else if (socket.user.roles.includes('passenger')) {
          member = await findPassengerByUserId(userId);
          role = 'passenger';

          if (!member) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'NOT_FOUND',
              message: 'Passenger not found',
            });
          } else if (member.isBlocked) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Passenger is blocked',
            });
          } else if (member.isSuspended) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Passenger is suspended',
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
            code: `FORBIDDEN`,
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
            code: 'FORBIDDEN',
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
            code: `FORBIDDEN`,
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
      if (!userId) {
        return socket.emit('error', {
          success: false,
          objectType,
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        });
      }

      try {
        let member;
        let role;
        if (socket.user.roles.includes('driver')) {
          member = await findDriverByUserId(userId);
          role = 'driver';

          if (!member) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'NOT_FOUND',
              message: 'Driver not found',
            });
          } else if (member.isBlocked) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Driver is blocked',
            });
          } else if (member.isSuspended) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Driver is suspended',
            });
          } else if (member.backgroundCheckStatus !== 'approved') {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Driver background not verified',
            });
          } else if (!['online', 'on_ride'].includes(member.status)) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Invalid driver status',
            });
          }
        } else if (socket.user.roles.includes('passenger')) {
          member = await findPassengerByUserId(userId);
          role = 'passenger';

          if (!member) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'NOT_FOUND',
              message: 'Passenger not found',
            });
          } else if (member.isBlocked) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Passenger is blocked',
            });
          } else if (member.isSuspended) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Passenger is suspended',
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
            code: 'FORBIDDEN',
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
            code: `FORBIDDEN`,
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
      if (!userId) {
        return socket.emit('error', {
          success: false,
          objectType,
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        });
      }

      try {
        const data = await findDashboardData();
        if (!data) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
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

    socket.on('admin:get_notifications', async ({ page = 1, limit = 10 }) => {
      const objectType = 'get-notifications';
      if (!userId) {
        return socket.emit('error', {
          success: false,
          objectType,
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        });
      }

      try {
        const data = await findAdminNotifications(userId, page, limit);
        if (!data) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Failed to fetch notifications',
          });
        }

        socket.emit('admin:get_notifications', {
          success: true,
          objectType,
          data,
          message: 'Notifications fetched successfully',
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
      'admin:toggle_notification_status',
      async ({ notificationId }) => {
        const objectType = 'toggle-notification-status';
        if (!userId) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
          });
        }

        try {
          const data = await toggleNotificationReadStatus(
            userId,
            notificationId,
          );
          if (!data) {
            return socket.emit('error', {
              success: false,
              objectType,
              code: 'FORBIDDEN',
              message: 'Failed to update notification status',
            });
          }

          socket.emit('admin:toggle_notification_status', {
            success: true,
            objectType,
            data,
            message: 'Notification status updated successfully',
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

    socket.on('admin:read_all_notifications', async () => {
      const objectType = 'read-all-notifications';
      if (!userId) {
        return socket.emit('error', {
          success: false,
          objectType,
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        });
      }

      try {
        const data = await markAllNotificationsAsRead(userId);
        if (!data) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Failed to real all notifications',
          });
        }

        socket.emit('admin:read_all_notifications', {
          success: true,
          objectType,
          data,
          message: 'All notifications read successfully',
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

    socket.on('admin:get_unread_notifications_count', async () => {
      const objectType = 'get-unread-notifications-count';
      if (!userId) {
        return socket.emit('error', {
          success: false,
          objectType,
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        });
      }

      try {
        const data = await findUnreadNotificationsCount(userId);
        if (!data) {
          return socket.emit('error', {
            success: false,
            objectType,
            code: 'FORBIDDEN',
            message: 'Failed to count unread notifications',
          });
        }

        socket.emit('admin:get_unread_notifications_count', {
          success: true,
          objectType,
          data: { unreadNotificationsCount: data },
          message: 'Unread notifications count fetched successfully',
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
      // Log user disconnection with role and token
      if (userId && userRole) {
        console.log('🔌 [ACTIVE] DISCONNECTED:', {
          userId,
          role: userRole,
          token: token || 'No token',
          socketId: socket.id,
          reason,
          timestamp: new Date().toISOString(),
        });
      } else {
        console.log('🔌 [ACTIVE] Anonymous disconnected:', {
          socketId: socket.id,
          reason,
          timestamp: new Date().toISOString(),
        });
      }
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
  
  // Subscribe to socket events from worker processes
  subscribeToSocketEvents();
  
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
  } else {
    // If called from a worker process (no ioInstance), use Redis pub/sub
    publishSocketEvent(userId, event, data);
  }
};

// Redis pub/sub for cross-process socket events
let pubClient = null;

export const initPubClient = () => {
  if (!pubClient) {
    pubClient = new Redis(env.REDIS_URL);
    console.log('📡 Redis pub client initialized for socket events');
  }
  return pubClient;
};

export const publishSocketEvent = (userId, event, data) => {
  if (!pubClient) {
    pubClient = new Redis(env.REDIS_URL);
  }
  const message = JSON.stringify({ userId, event, data });
  pubClient.publish('socket:emit', message);
};

// Subscribe to socket events from workers (called in main server only)
export const subscribeToSocketEvents = () => {
  const subClient = new Redis(env.REDIS_URL);
  subClient.subscribe('socket:emit', (err) => {
    if (err) {
      console.error('❌ Failed to subscribe to socket:emit channel', err);
      return;
    }
    console.log('📡 Subscribed to socket:emit channel for worker events');
  });

  subClient.on('message', (channel, message) => {
    if (channel === 'socket:emit' && ioInstance) {
      try {
        const { userId, event, data } = JSON.parse(message);
        ioInstance.to(`user:${userId}`).emit(event, data);
        console.log(`📡 Emitted ${event} to user:${userId} from worker`);
      } catch (error) {
        console.error('❌ Error processing socket event from worker', error);
      }
    }
  });

  return subClient;
};
