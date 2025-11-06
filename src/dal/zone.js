import mongoose from 'mongoose';
import Zone from '../models/Zone.js';
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
