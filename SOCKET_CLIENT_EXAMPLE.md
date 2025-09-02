# 🔌 Socket.IO Real-time Communication Client Guide

## Overview
This guide shows how to connect to the Socket.IO server for real-time communication between drivers and passengers during rides.

## Client Setup

### Installation
```bash
npm install socket.io-client
```

### Basic Connection
```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000', {
  auth: {
    token: `Bearer ${accessToken}` // JWT token from login
  }
});
```

## 🚗 Complete Ride Flow with Real-time Communication

### 1. Connection & Authentication
```javascript
const socket = io('http://localhost:3000', {
  auth: {
    token: `Bearer ${userAccessToken}`
  }
});

socket.on('connect', () => {
  console.log('✅ Connected to server');
});

socket.on('connect_error', (error) => {
  console.error('❌ Connection failed:', error.message);
});
```

### 2. Listen for Ride Assignment (Both Passenger & Driver)
```javascript
// When driver is assigned to ride
socket.on('ride:accepted', (data) => {
  console.log('🚗 Ride accepted:', data);
  
  // Automatically join the ride room for real-time communication
  socket.emit('ride:join', { rideId: data.rideId });
  
  // Update UI with driver/ride information
  updateRideStatus(data);
});

// Confirmation that user joined ride room
socket.on('ride:joined', (data) => {
  console.log('📍 Joined ride room:', data.rideId);
});
```

### 3. Real-time Chat System

#### Send Message
```javascript
function sendMessage(rideId, text) {
  const tempId = crypto.randomUUID(); // Temporary ID for UI
  
  socket.emit('chat:send', {
    rideId,
    tempId,
    text
  });
  
  // Add message to UI with tempId (pending state)
  addMessageToUI({ tempId, text, status: 'sending' });
}
```

#### Receive Messages
```javascript
// Message sent acknowledgment
socket.on('chat:ack', (data) => {
  console.log('✅ Message sent:', data);
  // Update UI: change message status from 'sending' to 'sent'
  updateMessageStatus(data.tempId, 'sent', data.messageId);
});

// New message received
socket.on('chat:message', (message) => {
  console.log('💬 New message:', message);
  addMessageToUI(message);
});

// Message read receipt
socket.on('chat:read', (data) => {
  console.log('👁️ Message read:', data);
  updateMessageReadStatus(data.messageId, data.readAt);
});
```

#### Typing Indicators
```javascript
// Send typing indicator
function setTyping(rideId, isTyping) {
  socket.emit('chat:typing', { rideId, isTyping });
}

// Receive typing indicator
socket.on('chat:typing', (data) => {
  if (data.isTyping) {
    showTypingIndicator(data.userId);
  } else {
    hideTypingIndicator(data.userId);
  }
});
```

### 4. Real-time Location Tracking (Driver)

#### Send Location Updates
```javascript
// Driver sends location updates every few seconds
function updateDriverLocation(rideId, coords) {
  socket.emit('ride:location', {
    rideId,
    coords: {
      lat: coords.latitude,
      lng: coords.longitude
    },
    heading: coords.heading,
    speed: coords.speed
  });
}

// Start location tracking
function startLocationTracking(rideId) {
  if (navigator.geolocation) {
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        updateDriverLocation(rideId, position.coords);
      },
      (error) => console.error('Location error:', error),
      { enableHighAccuracy: true, maximumAge: 1000 }
    );
    
    return watchId;
  }
}
```

#### Receive Location Updates (Passenger)
```javascript
socket.on('ride:location', (data) => {
  console.log('📍 Driver location:', data);
  
  // Update driver marker on map
  updateDriverMarkerOnMap(data.coords, data.heading);
  
  // Update ETA if needed
  calculateETA(data.coords);
});
```

### 5. Ride Status Updates
```javascript
// Send status update (driver)
function updateRideStatus(rideId, status, data = {}) {
  socket.emit('ride:status_update', {
    rideId,
    status,
    data
  });
}

// Receive status updates
socket.on('ride:status_update', (update) => {
  console.log('🔄 Ride status update:', update);
  
  switch (update.status) {
    case 'DRIVER_ARRIVING':
      showNotification('Driver is on the way');
      break;
    case 'DRIVER_ARRIVED':
      showNotification('Driver has arrived');
      break;
    case 'RIDE_STARTED':
      showNotification('Ride started');
      break;
    case 'RIDE_COMPLETED':
      showNotification('Ride completed');
      break;
  }
});
```

## 📱 Complete Client Implementation Examples

### Passenger App Example
```javascript
class PassengerRideClient {
  constructor(accessToken) {
    this.socket = io('http://localhost:3000', {
      auth: { token: `Bearer ${accessToken}` }
    });
    this.setupEventListeners();
  }
  
  setupEventListeners() {
    // Connection events
    this.socket.on('connect', () => {
      console.log('✅ Passenger connected');
    });
    
    // Ride assignment
    this.socket.on('ride:accepted', (data) => {
      this.onRideAccepted(data);
    });
    
    // Join ride room
    this.socket.on('ride:joined', (data) => {
      console.log('📍 Joined ride room:', data.rideId);
    });
    
    // Chat messages
    this.socket.on('chat:message', (message) => {
      this.displayMessage(message);
    });
    
    // Driver location
    this.socket.on('ride:location', (data) => {
      this.updateDriverLocation(data);
    });
    
    // Status updates
    this.socket.on('ride:status_update', (update) => {
      this.handleStatusUpdate(update);
    });
  }
  
  onRideAccepted(data) {
    // Join ride room for real-time communication
    this.socket.emit('ride:join', { rideId: data.rideId });
    
    // Update UI with driver info
    this.displayDriverInfo(data.driver);
    this.showRideStatus('Driver Assigned');
  }
  
  sendMessage(rideId, text) {
    const tempId = crypto.randomUUID();
    this.socket.emit('chat:send', { rideId, tempId, text });
    this.displayMessage({ tempId, text, sender: 'me', status: 'sending' });
  }
  
  updateDriverLocation(data) {
    // Update map with driver's current position
    this.map.updateDriverMarker(data.coords, data.heading);
  }
}
```

### Driver App Example
```javascript
class DriverRideClient {
  constructor(accessToken) {
    this.socket = io('http://localhost:3000', {
      auth: { token: `Bearer ${accessToken}` }
    });
    this.currentRideId = null;
    this.locationWatchId = null;
    this.setupEventListeners();
  }
  
  setupEventListeners() {
    this.socket.on('connect', () => {
      console.log('✅ Driver connected');
    });
    
    // New ride assignment
    this.socket.on('ride:accepted', (data) => {
      this.onRideAssigned(data);
    });
    
    // Chat messages
    this.socket.on('chat:message', (message) => {
      this.displayMessage(message);
      this.playNotificationSound();
    });
  }
  
  onRideAssigned(data) {
    this.currentRideId = data.rideId;
    
    // Join ride room
    this.socket.emit('ride:join', { rideId: data.rideId });
    
    // Start location tracking
    this.startLocationTracking();
    
    // Display ride details
    this.displayRideDetails(data.passenger);
  }
  
  startLocationTracking() {
    if (this.currentRideId && navigator.geolocation) {
      this.locationWatchId = navigator.geolocation.watchPosition(
        (position) => {
          this.socket.emit('ride:location', {
            rideId: this.currentRideId,
            coords: {
              lat: position.coords.latitude,
              lng: position.coords.longitude
            },
            heading: position.coords.heading,
            speed: position.coords.speed
          });
        },
        (error) => console.error('Location error:', error),
        { enableHighAccuracy: true, maximumAge: 1000 }
      );
    }
  }
  
  updateRideStatus(status, data = {}) {
    if (this.currentRideId) {
      this.socket.emit('ride:status_update', {
        rideId: this.currentRideId,
        status,
        data
      });
    }
  }
  
  sendMessage(text) {
    if (this.currentRideId) {
      const tempId = crypto.randomUUID();
      this.socket.emit('chat:send', {
        rideId: this.currentRideId,
        tempId,
        text
      });
    }
  }
}
```

## 🎯 REST API Integration

### Get Chat History
```javascript
async function getChatHistory(rideId, accessToken, before = null, limit = 50) {
  const response = await fetch(`/api/user/rides/${rideId}/chat?before=${before}&limit=${limit}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });
  
  const data = await response.json();
  return data.data.messages;
}
```

### Mark Messages as Read
```javascript
async function markMessagesAsRead(rideId, accessToken) {
  const response = await fetch(`/api/user/rides/${rideId}/chat/read`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });
  
  return await response.json();
}
```

## 🔧 Error Handling

```javascript
socket.on('error', (error) => {
  console.error('Socket error:', error);
  showUserMessage('Connection error. Please try again.');
});

socket.on('disconnect', (reason) => {
  console.log('Disconnected:', reason);
  
  if (reason === 'io server disconnect') {
    // Server disconnected, reconnect manually
    socket.connect();
  }
});

// Reconnection handling
socket.on('reconnect', (attemptNumber) => {
  console.log('Reconnected after', attemptNumber, 'attempts');
  
  // Rejoin ride room if in active ride
  if (currentRideId) {
    socket.emit('ride:join', { rideId: currentRideId });
  }
});
```

## 📡 Events Summary

### Emitted Events (Client → Server)
- `ride:join` - Join a ride room
- `ride:location` - Send location update (driver)
- `chat:send` - Send chat message
- `chat:read` - Mark message as read
- `chat:typing` - Send typing indicator
- `ride:status_update` - Update ride status

### Received Events (Server → Client)
- `ride:accepted` - Driver assigned to ride
- `ride:joined` - Successfully joined ride room
- `ride:user_joined` - Another user joined ride room
- `ride:location` - Driver location update
- `chat:ack` - Message send confirmation
- `chat:message` - New chat message
- `chat:read` - Message read receipt
- `chat:typing` - Typing indicator
- `chat:messages_read` - All messages marked as read
- `ride:status_update` - Ride status change
- `error` - Error message

This real-time system enables seamless communication between drivers and passengers throughout the entire ride experience! 🚗💬
