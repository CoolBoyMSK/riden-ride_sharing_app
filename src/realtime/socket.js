import { Server } from 'socket.io';
import env from '../config/envConfig.js';
import { verifyAccessToken } from '../utils/auth.js';
import { createMessage, markMessageRead } from '../dal/chat.js';
import { findRideByRideId } from '../dal/ride.js';

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
    const authHeader = socket.handshake.auth?.token || socket.handshake.headers?.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
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
          return socket.emit('error', { message: 'Forbidden: Not a participant in this ride' });
        }
        
        socket.join(`ride:${rideId}`);
        socket.emit('ride:joined', { rideId, message: 'Successfully joined ride room' });
        
        // Notify other participants that user joined
        socket.to(`ride:${rideId}`).emit('ride:user_joined', { 
          userId, 
          rideId,
          timestamp: new Date()
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
        timestamp: Date.now() 
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
          text: text.trim() 
        });
        
        // Acknowledge to sender with message ID
        socket.emit('chat:ack', { 
          tempId, 
          messageId: msg._id.toString(),
          timestamp: msg.createdAt
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
            readBy: userId
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
        timestamp: Date.now()
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
        timestamp: Date.now()
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
