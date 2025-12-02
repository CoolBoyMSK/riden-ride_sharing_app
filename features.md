# Frontend Developer Guide - Scheduled Ride Socket Events

---

# 🚗 DRIVER APP GUIDE

## Socket Events to Listen For

### 1. `ride:scheduled_ride_accepted`
**When:** Admin assigns you to a scheduled ride

**Payload:**
```javascript
{
  success: true,
  objectType: 'scheduled-ride-accepted',
  data: {
    ride: { /* full ride object */ },
    scheduledTime: "Sat, Dec 7, 2024, 10:30 AM",
    passengerName: "John Doe"
  },
  message: "You have been assigned to a scheduled ride for John Doe"
}
```

**Frontend Action:**
- Show notification/modal that you've been assigned to a scheduled ride
- Add the ride to upcoming scheduled rides list
- Display passenger details and pickup location
- Show "Acknowledge" button to confirm

---

### 2. `ride:scheduled_reminder`
**When:** 5 minutes before scheduled ride time (real-time reminder)

**Payload:**
```javascript
{
  success: true,
  objectType: 'scheduled-ride-reminder',
  data: {
    ride: { /* full ride object */ },
    minutesUntilRide: 5,
    scheduledTime: "2024-12-15T10:30:00.000Z"
  },
  message: "You have a scheduled ride in 5 minute(s). Please be ready."
}
```

**Frontend Action:**
- Show prominent alert: "Scheduled ride starts in 5 minutes!"
- Show pickup location and passenger details
- Ensure driver is ready and near pickup area
- Play notification sound

---

### 3. `ride:active`
**When:** Scheduled ride time arrives and ride activates

**Payload:**
```javascript
{
  success: true,
  objectType: 'active-ride',
  data: { /* full ride object with populated passenger */ },
  message: 'Your scheduled ride is now active'
}
```

**Frontend Action:**
- **If in app:** Navigate to active ride screen automatically
- **If received push notification:** Open app to active ride screen
- Start heading to pickup location
- Show "Driver Arriving" button to notify passenger

---

## Socket Events to Emit

### `ride:accept_scheduled_ride`
**When:** Driver wants to accept a scheduled ride (with or without pre-assignment)

This socket works for two scenarios:
1. **Driver claims an unassigned ride** - Any available driver can accept
2. **Driver acknowledges pre-assigned ride** - Confirms admin assignment

**Emit:**
```javascript
socket.emit('ride:accept_scheduled_ride', { rideId: "ride_id_here" });
```

**Listen for response:**
```javascript
socket.on('ride:accept_scheduled_ride', (response) => {
  if (response.success) {
    // Update UI to show ride is accepted/confirmed
    // response.data = ride object (with driver now assigned)
    // response.message = 'Scheduled ride accepted successfully' (new) 
    //                 or 'Scheduled ride acknowledged successfully' (pre-assigned)
  } else {
    // Handle error - show message to driver
    // Possible errors:
    // - 'This ride is already assigned to another driver'
    // - 'Your vehicle type does not match the ride requirement'
    // - 'Driver is not active/blocked/suspended'
  }
});
```

**Validations performed:**
- Driver must be active, not blocked, not suspended
- Driver background check must be approved
- Driver vehicle type must match ride's carType
- Ride must not be already assigned to another driver

---

## Updated `ride:active` Behavior

**Important:** Scheduled rides only appear in `ride:active` when:
1. The scheduled time has arrived, OR
2. The ride status has changed from SCHEDULED (ride activated)

Scheduled rides do **NOT** appear immediately after driver accepts - only when it's time.

When app opens, emit `ride:active` to check for active rides:
```javascript
socket.emit('ride:active');

socket.on('ride:active', (response) => {
  if (response.success && response.data) {
    const ride = response.data;
    if (ride.isScheduledRide) {
      // Scheduled ride - time has arrived
      // Show active ride screen - proceed to pickup
    } else {
      // Normal active ride - show active ride screen
    }
  }
});
```

**Note:** To show your accepted scheduled rides BEFORE their time, use a separate "My Scheduled Rides" API/list.

---

## Updated `ride:find` Behavior

The `ride:find` socket now **excludes**:
1. Scheduled rides that already have a driver assigned
2. Rides where you are already assigned

You will only see rides available for you to accept.

---

## Updated `ride:new_request` Behavior

If you have an **upcoming scheduled ride within 60 minutes**, you will NOT receive `ride:new_request` notifications. This prevents conflicts with your scheduled assignment.

---

## Push Notifications

| Notification Title | Action |
|--------------------|--------|
| "Scheduled Ride Assigned" | Navigate to scheduled ride details |
| "Scheduled Ride Reminder" | Navigate to scheduled ride details |
| "Scheduled Ride Started" | Navigate to active ride screen |

---

## Error Handling for `ride:accept_scheduled_ride`

| Error Code | Message | Action |
|------------|---------|--------|
| `UNAUTHORIZED` | Authentication required | Re-authenticate |
| `NOT_FOUND` | Driver/Ride not found | Refresh data |
| `INVALID_REQUEST` | This is not a scheduled ride | Check ride type |
| `FORBIDDEN` | You are not assigned to this ride | Refresh ride list |
| `INVALID_STATUS` | Cannot accept ride with status: X | Refresh status |

---

## Driver Flow Diagram

```
┌────────────────────────────────────────────────────────────┐
│                  DRIVER SCHEDULED RIDE FLOW                │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  OPTION A: DRIVER ACCEPTS UNASSIGNED RIDE                  │
│  ─────────────────────────────────────────                 │
│  1. SEE AVAILABLE SCHEDULED RIDES                          │
│     └─► Use: `ride:find` (includes unassigned scheduled)   │
│     └─► Show available scheduled rides to driver           │
│                                                            │
│  2. ACCEPT RIDE                                            │
│     └─► Emit: `ride:accept_scheduled_ride`                 │
│     └─► Listen: Response with assigned ride                │
│     └─► Update UI: "Ride Accepted"                         │
│     └─► Passenger receives notification                    │
│                                                            │
│  OPTION B: DRIVER RECEIVES PRE-ASSIGNMENT (Admin)          │
│  ─────────────────────────────────────────────────         │
│  1. RECEIVE ASSIGNMENT                                     │
│     └─► Listen: `ride:scheduled_ride_accepted`             │
│     └─► Push notification received                         │
│     └─► Show ride in "Upcoming Scheduled Rides"            │
│                                                            │
│  2. ACKNOWLEDGE (Optional)                                 │
│     └─► Emit: `ride:accept_scheduled_ride`                 │
│     └─► Listen: Response confirmation                      │
│     └─► Update UI: "Ride Confirmed"                        │
│                                                            │
│  COMMON FLOW (After acceptance/assignment):                │
│  ──────────────────────────────────────────                │
│  3. REMINDER                                               │
│     └─► Push notification before scheduled time            │
│                                                            │
│  4. RIDE ACTIVATES                                         │
│     └─► Listen: `ride:active`                              │
│     └─► Navigate to active ride screen                     │
│     └─► Start normal ride flow                             │
│                                                            │
│  5. CONTINUE NORMAL FLOW                                   │
│     └─► Emit: ride:driver_arriving                         │
│     └─► Emit: ride:driver_arrived                          │
│     └─► Emit: ride:driver_start_ride                       │
│     └─► etc...                                             │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

---
---

# 👤 PASSENGER APP GUIDE

## Socket Events to Listen For

### 1. `ride:scheduled_ride_accepted`
**When:** Admin assigns a driver to your scheduled ride

**Payload:**
```javascript
{
  success: true,
  objectType: 'scheduled-ride-accepted',
  data: {
    ride: { /* full ride object */ },
    scheduledTime: "Sat, Dec 7, 2024, 10:30 AM",
    driverName: "Mike Driver"
  },
  message: "Mike Driver has been assigned to your scheduled ride"
}
```

**Frontend Action:**
- Show notification/modal that driver has been assigned
- Update scheduled ride card to show driver details
- Display driver name, photo, vehicle info, rating

---

### 2. `ride:driver_acknowledged_scheduled_ride`
**When:** Driver confirms/acknowledges the scheduled ride

**Payload:**
```javascript
{
  success: true,
  objectType: 'driver-acknowledged-scheduled-ride',
  data: { /* ride object */ },
  message: "Mike Driver has confirmed the scheduled ride assignment"
}
```

**Frontend Action:**
- Show notification that driver confirmed
- Update scheduled ride card status to "Driver Confirmed" ✓
- Gives passenger confidence that driver will show up

---

### 3. `ride:scheduled_reminder`
**When:** 5 minutes before scheduled ride time (real-time reminder)

**Payload:**
```javascript
{
  success: true,
  objectType: 'scheduled-ride-reminder',
  data: {
    ride: { /* full ride object */ },
    minutesUntilRide: 5,
    scheduledTime: "2024-12-15T10:30:00.000Z"
  },
  message: "Your scheduled ride is in 5 minute(s). Please be ready at the pickup location."
}
```

**Frontend Action:**
- Show prominent alert/modal: "Your ride starts in 5 minutes!"
- Show pickup location and driver details (if assigned)
- Add "Navigate to Pickup" button if applicable
- Play a notification sound

---

### 3. `ride:active`
**When:** Scheduled ride time arrives and ride activates

**Payload:**
```javascript
{
  success: true,
  objectType: 'active-ride',
  data: { /* full ride object with populated driver */ },
  message: 'Your scheduled ride is now active'
}
```

**Frontend Action:**
- **If in app:** Navigate to active ride screen automatically
- **If received push notification:** Open app to active ride screen
- Show driver is on the way / heading to pickup
- Display ETA and driver location on map

---

### 4. `ride:driver_unavailable`
**When:** Assigned driver is not available when ride activates (offline, on another ride)

**Payload:**
```javascript
{
  success: false,
  objectType: 'driver-unavailable',
  data: { /* ride object with driverId cleared, status: 'REQUESTED' */ },
  message: 'Your assigned driver is unavailable. Searching for a new driver.'
}
```

**Frontend Action:**
- Show notification/toast that assigned driver couldn't make it
- Update UI to show "Searching for drivers" state with loading indicator
- Clear previous driver details from UI
- Listen for `ride:active` again when a new driver is found

---

## Updated `ride:active` Behavior

**Important:** Scheduled rides only appear in `ride:active` when:
1. The scheduled time has arrived, OR
2. The ride has been activated (status changed from SCHEDULED)

Scheduled rides do **NOT** appear immediately after booking - they only show when it's time!

When app opens, emit `ride:active` to check for active rides:
```javascript
socket.emit('ride:active');

socket.on('ride:active', (response) => {
  if (response.success && response.data) {
    const ride = response.data;
    
    if (ride.isScheduledRide) {
      // Scheduled ride - time has arrived
      if (ride.status === 'DRIVER_ASSIGNED') {
        // Driver accepted, ready to start - show driver details
      } else if (ride.status === 'SCHEDULED') {
        // Time arrived, waiting for driver to accept
        // Display: "Searching for drivers..."
      } else if (ride.status === 'REQUESTED') {
        // Searching for driver (after activation or driver unavailable)
        // Display: "Searching for drivers..."
      } else {
        // Ride in progress - show active ride screen
      }
    } else {
      // Normal active ride - show active ride screen
    }
  } else {
    // No active ride - show home screen
    // Check "My Scheduled Rides" for upcoming bookings
  }
});
```

**Note:** To show upcoming scheduled rides BEFORE their time (in a "My Scheduled Rides" list), use a separate API endpoint, not `ride:active`.

---

## Push Notifications

| Notification Title | Action |
|--------------------|--------|
| "Driver Assigned to Your Scheduled Ride" | Navigate to scheduled ride details |
| "Driver Confirmed" | Navigate to scheduled ride details |
| "Scheduled Ride Reminder" | Navigate to scheduled ride details |
| "Scheduled Ride Started" | Navigate to active ride screen |
| "Driver Unavailable" | Navigate to ride screen (searching state) |

---

## Passenger Flow Diagram

```
┌────────────────────────────────────────────────────────────┐
│                PASSENGER SCHEDULED RIDE FLOW               │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  1. BOOK SCHEDULED RIDE                                    │
│     └─► Ride created with status: SCHEDULED                │
│     └─► Wait for admin to assign driver                    │
│                                                            │
│  2. DRIVER ASSIGNED                                        │
│     └─► Listen: `ride:scheduled_ride_accepted`             │
│     └─► Push notification received                         │
│     └─► Show driver details on scheduled ride card         │
│                                                            │
│  3. DRIVER CONFIRMS (Optional)                             │
│     └─► Listen: `ride:driver_acknowledged_scheduled_ride`  │
│     └─► Update UI: "Driver Confirmed" ✓                    │
│                                                            │
│  4. REMINDER                                               │
│     └─► Push notification before scheduled time            │
│                                                            │
│  5. RIDE ACTIVATES                                         │
│     ├─► IF driver available:                               │
│     │   └─► Listen: `ride:active`                          │
│     │   └─► Navigate to active ride screen                 │
│     │   └─► Show driver on map heading to pickup           │
│     │                                                      │
│     └─► IF driver unavailable:                             │
│         └─► Listen: `ride:driver_unavailable`              │
│         └─► Show "Searching for drivers" state             │
│         └─► Wait for `ride:active` with new driver         │
│                                                            │
│  6. CONTINUE NORMAL FLOW                                   │
│     └─► Listen: ride:driver_arriving                       │
│     └─► Listen: ride:driver_arrived                        │
│     └─► Emit: ride:passenger_ready                         │
│     └─► etc...                                             │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

---
---

# 📊 QUICK REFERENCE

## All Socket Events Summary

| Event | Driver | Passenger | Direction |
|-------|--------|-----------|-----------|
| `ride:scheduled_ride_accepted` | ✅ Listen | ✅ Listen | Server → Client |
| `ride:accept_scheduled_ride` | ✅ Emit & Listen | ❌ | Client → Server |
| `ride:driver_acknowledged_scheduled_ride` | ❌ | ✅ Listen | Server → Client |
| `ride:active` | ✅ Listen | ✅ Listen | Server → Client |
| `ride:driver_unavailable` | ❌ | ✅ Listen | Server → Client |
| `ride:find` | ✅ Emit & Listen | ❌ | Client ↔ Server |

---

## Ride Status States for Scheduled Rides

| Status | Description | Driver UI | Passenger UI |
|--------|-------------|-----------|--------------|
| `SCHEDULED` | Waiting for driver assignment | N/A | "Waiting for driver" |
| `DRIVER_ASSIGNED` | Driver assigned, before activation | "Upcoming Ride" | "Driver Assigned" |
| `REQUESTED` | Searching for driver (after unavailable) | N/A | "Searching for drivers" |
| `DRIVER_ARRIVING` | Ride active, driver heading to pickup | "Head to Pickup" | "Driver on the way" |

---

## Complete Flow Timeline

```
TIME ─────────────────────────────────────────────────────────────────►

[Booking]     [Assignment]      [Reminder]      [Activation]    [Ride]
    │              │                │                │            │
    ▼              ▼                ▼                ▼            ▼
 Passenger     Admin assigns    Push notif      ride:active   Normal
 creates       driver           sent to both    emitted       ride
 scheduled     ─────►           (30min before)  ─────►        flow
 ride          Both receive                     Both navigate
               ride:scheduled_                  to active
               ride_accepted                    ride screen
```
