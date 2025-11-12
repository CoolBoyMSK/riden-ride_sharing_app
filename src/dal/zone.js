import mongoose from 'mongoose';
import Zone from '../models/Zone.js';
import ParkingQueue from '../models/ParkingQueue.js';
import { ZONE_TYPES } from '../enums/zoneTypes.js';

export const createZone = async (payload) => {
  // Validate required fields
  const requiredFields = ['name', 'type', 'boundaries'];
  for (const field of requiredFields) {
    if (!payload[field]) {
      throw new Error(`Missing required field: ${field}`);
    }
  }

  // Validate boundaries structure
  if (!payload.boundaries.type || !payload.boundaries.coordinates) {
    throw new Error(
      'Invalid boundaries structure. Must have type and coordinates',
    );
  }

  // Validate polygon coordinates
  const coordinates = payload.boundaries.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length === 0) {
    throw new Error('Coordinates must be a non-empty array');
  }

  const firstRing = coordinates[0];
  if (!Array.isArray(firstRing) || firstRing.length < 4) {
    throw new Error(
      'Polygon must have at least 4 points (including closing point)',
    );
  }

  // Check if polygon is closed
  const firstPoint = firstRing[0];
  const lastPoint = firstRing[firstRing.length - 1];

  if (firstPoint[0] !== lastPoint[0] || firstPoint[1] !== lastPoint[1]) {
    throw new Error(
      'Polygon must be closed (first and last points must be identical)',
    );
  }

  // Validate coordinate ranges
  for (const ring of coordinates) {
    for (const [lng, lat] of ring) {
      if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
        throw new Error(
          `Invalid coordinate [${lng}, ${lat}]. Longitude must be between -180 and 180, latitude between -90 and 90.`,
        );
      }
    }
  }

  // Check if zone name already exists
  const existingZone = await Zone.findOne({
    name: { $regex: new RegExp(`^${payload.name}$`, 'i') },
  });
  if (existingZone) {
    throw new Error(`Zone with name '${payload.name}' already exists.`);
  }

  // Check for overlapping zones (optional but recommended)
  const overlappingZone = await Zone.findOne({
    boundaries: {
      $geoIntersects: {
        $geometry: {
          type: 'Polygon',
          coordinates: payload.boundaries.coordinates,
        },
      },
    },
    isActive: true,
  });

  if (overlappingZone) {
    throw new Error(
      `Zone boundaries overlap with existing zone '${overlappingZone.name}'. Please adjust boundaries to avoid overlap.`,
    );
  }

  // Validate search radius and time configuration
  if (payload.minSearchRadius && payload.maxSearchRadius) {
    if (payload.minSearchRadius > payload.maxSearchRadius) {
      throw new Error(
        'Minimum search radius cannot be greater than maximum search radius',
      );
    }
  }

  if (payload.minRadiusSearchTime && payload.maxRadiusSearchTime) {
    if (
      payload.minRadiusSearchTime > payload.maxRadiusSearchTime &&
      payload.maxRadiusSearchTime !== 1
    ) {
      throw new Error(
        'Minimum radius search time cannot be greater than maximum radius search time',
      );
    }
  }

  // Create the zone
  const zone = await Zone.create({
    name: payload.name,
    type: payload.type,
    boundaries: {
      type: payload.boundaries.type,
      coordinates: payload.boundaries.coordinates,
    },
    minSearchRadius: payload.minSearchRadius || 5,
    maxSearchRadius: payload.maxSearchRadius || 10,
    minRadiusSearchTime: payload.minRadiusSearchTime || 2,
    maxRadiusSearchTime: payload.maxRadiusSearchTime || 1,
    isActive: payload.isActive !== undefined ? payload.isActive : true,
    description: payload.description,
    metadata: payload.metadata || {},
  });

  if (payload.type === 'airport-parking') {
    try {
      const airportId = await findNearestAirport(
        payload.boundaries.coordinates,
      );
      if (!airportId) {
        console.log('No airport found within 500km radius');
        return zone;
      }

      // Create parking queue entry
      await ParkingQueue.create({
        parkingLotId: zone._id,
        airportId,
      });

      console.log(
        `Created parking queue for airport-parking zone ${zone.name} linked to airport`,
      );
    } catch (error) {
      console.error('Error creating parking queue:', error);
    }
  }

  return zone;
};

export const getAllZones = async (filters = {}, pagination = {}) => {
  const { page = 1, limit = 10 } = pagination;
  const skip = (page - 1) * limit;

  const query = {};

  if (filters.isActive !== undefined) {
    query.isActive = filters.isActive;
  }

  if (filters.type) {
    query.type = filters.type;
  }

  // Get total count
  const totalCount = await Zone.countDocuments(query);

  // Get paginated results
  const zones = await Zone.find(query)
    .sort({ name: 1 })
    .skip(skip)
    .limit(limit)
    .lean();

  const totalPages = Math.ceil(totalCount / limit);

  return {
    data: zones,
    total: totalCount,
    page: parseInt(page),
    limit: parseInt(limit),
    totalPages,
  };
};

export const getZoneById = async (zoneId) => {
  if (!mongoose.Types.ObjectId.isValid(zoneId)) {
    throw new Error('Invalid zone ID');
  }

  const zone = await Zone.findById(zoneId).lean();

  if (!zone) {
    throw new Error('Zone not found');
  }

  return zone;
};

export const updateZone = async (zoneId, updateData) => {
  if (!mongoose.Types.ObjectId.isValid(zoneId)) {
    throw new Error('Invalid zone ID');
  }

  // Check if zone exists
  const existingZone = await Zone.findById(zoneId);
  if (!existingZone) {
    throw new Error('Zone not found');
  }

  // If name is being updated, check for duplicates
  if (updateData.name && updateData.name !== existingZone.name) {
    const duplicateZone = await Zone.findOne({
      name: { $regex: new RegExp(`^${updateData.name}$`, 'i') },
    });
    if (duplicateZone) {
      throw new Error(`Zone with name '${updateData.name}' already exists`);
    }
  }

  // If boundaries are being updated, check for overlaps
  if (updateData.boundaries) {
    const overlappingZone = await Zone.findOne({
      boundaries: {
        $geoIntersects: {
          $geometry: {
            type: 'Polygon',
            coordinates: updateData.boundaries.coordinates,
          },
        },
      },
      isActive: true,
      _id: { $ne: zoneId }, // Exclude current zone
    });

    if (overlappingZone) {
      throw new Error(
        `Zone boundaries overlap with existing zone '${overlappingZone.name}'`,
      );
    }
  }

  const updatedZone = await Zone.findByIdAndUpdate(zoneId, updateData, {
    new: true,
    runValidators: true,
  });

  return updatedZone;
};

export const deleteZone = async (zoneId) => {
  if (!mongoose.Types.ObjectId.isValid(zoneId)) {
    throw new Error('Invalid zone ID');
  }

  const deletedZone = await Zone.findByIdAndDelete(zoneId);
  if (!deletedZone) {
    throw new Error('Zone not found');
  }

  return { success: true };
};

export const getZoneByLocation = async (lng, lat) => {
  const zone = await Zone.findOne({
    boundaries: {
      $geoIntersects: {
        $geometry: {
          type: 'Point',
          coordinates: [lng, lat],
        },
      },
    },
    isActive: true,
  });

  if (!zone) {
    return {
      success: true,
      data: null,
      message: 'No active zone found for this location',
    };
  }

  return zone;
};

export const getZoneTypes = () => {
  return ZONE_TYPES;
};

export const findNearestAirport = async (zoneCoordinates) => {
  // Validate zone coordinates
  if (
    !zoneCoordinates ||
    !Array.isArray(zoneCoordinates) ||
    zoneCoordinates.length === 0
  ) {
    throw new Error('Invalid zone coordinates provided.');
  }

  try {
    const zoneCenter = getZoneCenter(zoneCoordinates);

    const result = await Zone.aggregate([
      {
        $geoNear: {
          near: {
            type: 'Point',
            coordinates: zoneCenter,
          },
          distanceField: 'distance',
          spherical: true,
          key: 'boundaries',
          maxDistance: 500000, // 500km maximum search distance in meters
        },
      },
      {
        $match: {
          type: 'airport',
          isActive: true,
        },
      },
      {
        $project: {
          _id: 1,
          name: 1,
          type: 1,
          boundaries: 1,
          distance: 1,
          distanceKm: { $divide: ['$distance', 1000] },
          minSearchRadius: 1,
          maxSearchRadius: 1,
          isActive: 1,
        },
      },
      {
        $sort: {
          distance: 1, // Sort by distance to get the nearest
        },
      },
      {
        $limit: 1,
      },
    ]);

    if (result.length === 0) {
      console.log('No airports found within 500km radius');
      return null;
    }

    const nearestAirport = result[0];
    console.log(
      `📍 Nearest airport: ${nearestAirport.name}, Distance: ${nearestAirport.distanceKm.toFixed(2)}km`,
    );

    return nearestAirport._id;
  } catch (error) {
    console.error('Error finding nearest airport:', error);
    throw new Error(`Failed to find nearest airport: ${error.message}`);
  }
};

const getZoneCenter = (coordinates) => {
  if (!coordinates || !coordinates[0] || !Array.isArray(coordinates[0])) {
    throw new Error(
      'Invalid coordinates structure for zone center calculation',
    );
  }

  const polygonRing = coordinates[0];

  if (!polygonRing || polygonRing.length === 0) {
    throw new Error('Empty polygon ring provided');
  }

  let sumLng = 0;
  let sumLat = 0;
  let count = 0;

  for (const coord of polygonRing) {
    if (Array.isArray(coord) && coord.length >= 2) {
      const [lng, lat] = coord;
      // Skip if coordinates are invalid
      if (
        typeof lng === 'number' &&
        typeof lat === 'number' &&
        !isNaN(lng) &&
        !isNaN(lat) &&
        lng >= -180 &&
        lng <= 180 &&
        lat >= -90 &&
        lat <= 90
      ) {
        sumLng += lng;
        sumLat += lat;
        count++;
      }
    }
  }

  if (count === 0) {
    // Fallback to first valid coordinate
    for (const coord of polygonRing) {
      if (Array.isArray(coord) && coord.length >= 2) {
        const [lng, lat] = coord;
        if (typeof lng === 'number' && typeof lat === 'number') {
          console.log('⚠️ Using fallback coordinate for zone center');
          return [lng, lat];
        }
      }
    }
    throw new Error('No valid coordinates found for center calculation');
  }

  const center = [sumLng / count, sumLat / count];
  console.log(`📍 Calculated zone center: [${center[0]}, ${center[1]}]`);
  return center;
};
