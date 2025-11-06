import mongoose from 'mongoose';
import FareManagement from '../models/fareManagement.js';
import { CAR_TYPES } from '../enums/carType.js';

export const createFareConfiguration = async (fareData) => {
  const requiredFields = ['zone', 'dailyFares'];
  for (const field of requiredFields) {
    if (!fareData[field]) {
      throw new Error(`Missing required field: ${field}`);
    }
  }

  // Validate zone structure
  if (!fareData.zone.name || !fareData.zone.city || !fareData.zone.boundaries) {
    throw new Error('Invalid zone data structure');
  }

  // Validate dailyFares is an array
  if (!Array.isArray(fareData.dailyFares)) {
    throw new Error('dailyFares must be an array');
  }

  // ✅ COMPULSORY: Check if fares are provided for ALL car types
  const providedCarTypes = fareData.dailyFares.map((fare) => fare.carType);
  const missingCarTypes = CAR_TYPES.filter(
    (carType) => !providedCarTypes.includes(carType),
  );

  if (missingCarTypes.length > 0) {
    throw new Error(
      `Missing fare configuration for car types: ${missingCarTypes.join(', ')}. All car types must be configured.`,
    );
  }

  // ✅ COMPULSORY: Check for duplicate car types
  const carTypeSet = new Set();
  const duplicateCarTypes = [];

  for (const fare of fareData.dailyFares) {
    if (carTypeSet.has(fare.carType)) {
      duplicateCarTypes.push(fare.carType);
    } else {
      carTypeSet.add(fare.carType);
    }
  }

  if (duplicateCarTypes.length > 0) {
    throw new Error(
      `Duplicate fare configuration for car types: ${duplicateCarTypes.join(', ')}`,
    );
  }

  // Validate each dailyFare entry
  for (const dailyFare of fareData.dailyFares) {
    const dailyFaresRequired = [
      'carType',
      'rideSetupFee',
      'baseFare',
      'perMinuteFare',
      'perKmFare',
      'waiting',
      'discount',
      'nightTime',
      'nightCharge',
    ];

    for (const field of dailyFaresRequired) {
      if (dailyFare[field] === undefined || dailyFare[field] === null) {
        throw new Error(
          `Missing required dailyFares field: ${field} for carType ${dailyFare.carType}`,
        );
      }
    }

    // Validate nested objects
    if (!dailyFare.waiting || typeof dailyFare.waiting !== 'object') {
      throw new Error(
        `Invalid waiting object for carType ${dailyFare.carType}`,
      );
    }
    if (
      dailyFare.waiting.seconds === undefined ||
      dailyFare.waiting.charge === undefined
    ) {
      throw new Error(
        `Missing waiting.seconds or waiting.charge for carType ${dailyFare.carType}`,
      );
    }

    if (!dailyFare.discount || typeof dailyFare.discount !== 'object') {
      throw new Error(
        `Invalid discount object for carType ${dailyFare.carType}`,
      );
    }
    if (
      dailyFare.discount.minutes === undefined ||
      dailyFare.discount.distance === undefined ||
      dailyFare.discount.charge === undefined
    ) {
      throw new Error(
        `Missing discount.minutes, discount.distance, or discount.charge for carType ${dailyFare.carType}`,
      );
    }

    if (!dailyFare.nightTime || typeof dailyFare.nightTime !== 'object') {
      throw new Error(
        `Invalid nightTime object for carType ${dailyFare.carType}`,
      );
    }
    if (!dailyFare.nightTime.from || !dailyFare.nightTime.to) {
      throw new Error(
        `Missing nightTime.from or nightTime.to for carType ${dailyFare.carType}`,
      );
    }
  }

  // ✅ COMPULSORY: Check if zone already exists for this city (by name)
  const existingZoneByName = await FareManagement.findOne({
    'zone.name': fareData.zone.name,
    'zone.city': fareData.zone.city,
    'zone.isActive': true,
  });

  if (existingZoneByName) {
    throw new Error(
      `Zone '${fareData.zone.name}' already exists in ${fareData.zone.city}`,
    );
  }

  // ✅ COMPULSORY: Check for overlapping areas in the same city
  const overlappingZone = await FareManagement.findOne({
    'zone.city': fareData.zone.city,
    'zone.isActive': true,
    'zone.boundaries': {
      $geoIntersects: {
        $geometry: {
          type: 'Polygon',
          coordinates: fareData.zone.boundaries.coordinates,
        },
      },
    },
  });

  if (overlappingZone) {
    throw new Error(
      `Zone boundaries overlap with existing zone '${overlappingZone.zone.name}' in ${fareData.zone.city}. Please adjust boundaries to avoid overlap.`,
    );
  }

  // ✅ COMPULSORY: Validate polygon geometry (basic validation)
  const polygonCoordinates = fareData.zone.boundaries.coordinates;
  if (!Array.isArray(polygonCoordinates) || polygonCoordinates.length === 0) {
    throw new Error('Invalid polygon coordinates');
  }

  // Check if polygon is closed (first and last points should be the same)
  const firstRing = polygonCoordinates[0];
  if (firstRing.length < 4) {
    throw new Error(
      'Polygon must have at least 4 points (including closing point)',
    );
  }

  const firstPoint = firstRing[0];
  const lastPoint = firstRing[firstRing.length - 1];

  if (firstPoint[0] !== lastPoint[0] || firstPoint[1] !== lastPoint[1]) {
    throw new Error(
      'Polygon must be closed (first and last points must be identical)',
    );
  }

  // Check for valid coordinate ranges
  for (const ring of polygonCoordinates) {
    for (const [lng, lat] of ring) {
      if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
        throw new Error(
          `Invalid coordinate [${lng}, ${lat}]. Longitude must be between -180 and 180, latitude between -90 and 90.`,
        );
      }
    }
  }

  // Create the fare configuration
  const fareManagement = new FareManagement({
    zone: {
      name: fareData.zone.name,
      city: fareData.zone.city,
      zoneType: fareData.zone.zoneType || 'standard',
      boundaries: {
        type: 'Polygon',
        coordinates: fareData.zone.boundaries.coordinates,
      },
      isActive:
        fareData.zone.isActive !== undefined ? fareData.zone.isActive : true,
    },
    dailyFares: fareData.dailyFares.map((fare) => ({
      carType: fare.carType,
      rideSetupFee: fare.rideSetupFee,
      baseFare: fare.baseFare,
      perMinuteFare: fare.perMinuteFare,
      perKmFare: fare.perKmFare,
      waiting: {
        seconds: fare.waiting.seconds,
        charge: fare.waiting.charge,
      },
      discount: {
        minutes: fare.discount.minutes,
        distance: fare.discount.distance,
        charge: fare.discount.charge,
      },
      nightTime: {
        from: fare.nightTime.from,
        to: fare.nightTime.to,
      },
      nightCharge: fare.nightCharge,
      surge: fare.surge || [],
    })),
  });

  await fareManagement.save();
  return {
    success: true,
    data: fareManagement,
    message: 'Fare configuration created successfully with all car types',
  };
};

export const getFareConfigurations = async (filters = {}, pagination = {}) => {
  const { city, cartype } = filters;
  const { page = 1, limit = 10 } = pagination;
  const skip = (page - 1) * limit;

  // Build the aggregation pipeline
  const pipeline = [];

  // Stage 1: Match documents based on filters
  const matchStage = {
    $match: {
      'zone.isActive': true,
    },
  };

  if (city) {
    matchStage.$match['zone.city'] = new RegExp(city, 'i');
  }

  if (cartype) {
    if (!CAR_TYPES.includes(cartype)) {
      throw new Error(
        `Invalid car type: ${cartype}. Must be one of: ${CAR_TYPES.join(', ')}`,
      );
    }
    matchStage.$match['dailyFares.carType'] = cartype;
  }

  pipeline.push(matchStage);

  // Stage 2: Filter dailyFares array if cartype is specified
  if (cartype) {
    const filterStage = {
      $addFields: {
        dailyFares: {
          $filter: {
            input: '$dailyFares',
            as: 'fare',
            cond: { $eq: ['$$fare.carType', cartype] },
          },
        },
      },
    };
    pipeline.push(filterStage);
  }

  // Stage 3: Filter out documents that have empty dailyFares after filtering
  if (cartype) {
    const emptyFilterStage = {
      $match: {
        'dailyFares.0': { $exists: true }, // Ensure dailyFares array is not empty
      },
    };
    pipeline.push(emptyFilterStage);
  }

  // Create count pipeline (without pagination)
  const countPipeline = [...pipeline];
  countPipeline.push({ $count: 'totalCount' });

  // Add pagination and sorting to main pipeline
  pipeline.push(
    { $skip: skip },
    { $limit: limit },
    { $sort: { 'zone.city': 1, 'zone.name': 1 } },
  );

  // Execute both pipelines
  const [fareConfigurations, countResult] = await Promise.all([
    FareManagement.aggregate(pipeline),
    FareManagement.aggregate(countPipeline),
  ]);

  const totalCount = countResult.length > 0 ? countResult[0].totalCount : 0;

  // Transform the data
  let transformedData;
  let message;

  if (cartype) {
    // For carType filter, we should only have one fare per zone
    transformedData = fareConfigurations
      .map((config) => {
        // Double-check that we only have the requested carType
        const filteredFares = config.dailyFares.filter(
          (fare) => fare.carType === cartype,
        );

        if (filteredFares.length === 0) {
          console.warn(
            `Zone ${config.zone.name} has no ${cartype} fare after filtering!`,
          );
          return null;
        }

        if (filteredFares.length > 1) {
          console.warn(
            `Zone ${config.zone.name} has multiple ${cartype} fares after filtering!`,
          );
        }

        return {
          _id: config._id,
          zone: config.zone,
          fare: filteredFares[0], // Take the first matching fare
          createdAt: config.createdAt,
          updatedAt: config.updatedAt,
        };
      })
      .filter((config) => config !== null); // Remove null entries

    if (city) {
      message = `Found ${transformedData.length} ${cartype} fare configurations in ${city}`;
    } else {
      message = `Found ${transformedData.length} zones with ${cartype} fare configuration`;
    }
  } else {
    // No carType filter - return all fares
    transformedData = fareConfigurations.map((config) => ({
      _id: config._id,
      zone: config.zone,
      dailyFares: config.dailyFares,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    }));

    if (city) {
      message = `Found ${transformedData.length} fare configurations in ${city}`;
    } else {
      message = `Found ${transformedData.length} active fare configurations`;
    }
  }

  const totalPages = Math.ceil(totalCount / limit);

  return {
    data: transformedData,
    total: totalCount,
    page: parseInt(page),
    limit: parseInt(limit),
    totalPages,
  };
};

export const getFareConfigurationById = async (fareId) => {
  if (!fareId || !mongoose.Types.ObjectId.isValid(fareId)) {
    throw new Error('Invalid fare configuration ID');
  }

  const fareConfiguration = await FareManagement.findById(fareId);

  if (!fareConfiguration) {
    throw new Error('Fare configuration not found');
  }

  return fareConfiguration;
};

export const updateFareByZoneNameAndCarType = async (
  zoneName,
  city,
  carType,
  updateData,
) => {
  const fareManagement = await FareManagement.findOne({
    'zone.name': zoneName,
    'zone.city': city,
    'zone.isActive': true,
    'dailyFares.carType': carType,
  });

  if (!fareManagement) {
    throw new Error(
      `Fare configuration not found for zone '${zoneName}' in ${city} with car type '${carType}'`,
    );
  }

  // Find the specific car type fare
  const carTypeFare = fareManagement.dailyFares.find(
    (fare) => fare.carType === carType,
  );
  if (!carTypeFare) {
    throw new Error(`Car type '${carType}' not found in zone '${zoneName}'`);
  }

  // Update the fare data
  Object.keys(updateData).forEach((key) => {
    if (key === 'waiting' && updateData.waiting) {
      if (updateData.waiting.seconds !== undefined)
        carTypeFare.waiting.seconds = updateData.waiting.seconds;
      if (updateData.waiting.charge !== undefined)
        carTypeFare.waiting.charge = updateData.waiting.charge;
    } else if (key === 'discount' && updateData.discount) {
      if (updateData.discount.minutes !== undefined)
        carTypeFare.discount.minutes = updateData.discount.minutes;
      if (updateData.discount.distance !== undefined)
        carTypeFare.discount.distance = updateData.discount.distance;
      if (updateData.discount.charge !== undefined)
        carTypeFare.discount.charge = updateData.discount.charge;
    } else if (key === 'nightTime' && updateData.nightTime) {
      if (updateData.nightTime.from)
        carTypeFare.nightTime.from = updateData.nightTime.from;
      if (updateData.nightTime.to)
        carTypeFare.nightTime.to = updateData.nightTime.to;
    } else if (key === 'surge' && updateData.surge) {
      carTypeFare.surge = updateData.surge;
    } else {
      carTypeFare[key] = updateData[key];
    }
  });

  await fareManagement.save();
  return {
    success: true,
    data: fareManagement,
    message: `Fare for ${carType} in zone '${zoneName}' updated successfully`,
  };
};

export const deleteFareConfiguration = async (zoneId) => {
  const result = await FareManagement.findByIdAndDelete(zoneId);
  if (!result) {
    throw new Error('Fare configuration not found');
  }

  return {
    success: true,
    message: 'Fare configuration deleted successfully',
  };
};

export const findZoneByLocation = async (lng, lat) => {
  const zone = await FareManagement.findOne({
    'zone.boundaries': {
      $geoIntersects: {
        $geometry: {
          type: 'Point',
          coordinates: [lng, lat],
        },
      },
    },
    'zone.isActive': true,
  });

  return zone;
};

export const getFareForLocation = async (lng, lat, carType) => {
  const fareManagement = await FareManagement.findOne({
    'zone.boundaries': {
      $geoIntersects: {
        $geometry: {
          type: 'Point',
          coordinates: [lng, lat],
        },
      },
    },
    'zone.isActive': true,
    'dailyFares.carType': carType,
  });

  return fareManagement;
};
