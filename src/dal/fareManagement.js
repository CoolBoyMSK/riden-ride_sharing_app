import mongoose from 'mongoose';
import FareManagement from '../models/fareManagement.js';
import { CAR_TYPES } from '../enums/carType.js';

// Helper functions
const getNestedValue = (obj, path) => {
  return path.split('.').reduce((current, key) => {
    return current ? current[key] : undefined;
  }, obj);
};

// Main functions
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
  return fareManagement;
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
  return fareManagement;
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

export const createDefaultFareConfiguration = async (payload) => {
  // Validate that payload has dailyFares
  if (!payload.dailyFares || !Array.isArray(payload.dailyFares)) {
    throw new Error('dailyFares array is required and must be an array');
  }

  // Validate that all car types are provided
  const providedCarTypes = payload.dailyFares.map((fare) => fare.carType);
  const missingCarTypes = CAR_TYPES.filter(
    (carType) => !providedCarTypes.includes(carType),
  );

  if (missingCarTypes.length > 0) {
    throw new Error(
      `Missing fare configuration for car types: ${missingCarTypes.join(', ')}. All car types must be configured.`,
    );
  }

  // Validate for duplicate car types
  const carTypeSet = new Set();
  const duplicateCarTypes = [];

  for (const fare of payload.dailyFares) {
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

  // Validate each dailyFare entry has all required fields
  const requiredFields = [
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

  const requiredWaitingFields = ['seconds', 'charge'];
  const requiredDiscountFields = ['minutes', 'distance', 'charge'];
  const requiredNightTimeFields = ['from', 'to'];

  for (const dailyFare of payload.dailyFares) {
    // Check top-level required fields
    for (const field of requiredFields) {
      if (dailyFare[field] === undefined || dailyFare[field] === null) {
        throw new Error(
          `Missing required field '${field}' for carType ${dailyFare.carType}`,
        );
      }
    }

    // Validate waiting object
    if (!dailyFare.waiting || typeof dailyFare.waiting !== 'object') {
      throw new Error(
        `Invalid waiting object for carType ${dailyFare.carType}`,
      );
    }
    for (const field of requiredWaitingFields) {
      if (
        dailyFare.waiting[field] === undefined ||
        dailyFare.waiting[field] === null
      ) {
        throw new Error(
          `Missing waiting.${field} for carType ${dailyFare.carType}`,
        );
      }
    }

    // Validate discount object
    if (!dailyFare.discount || typeof dailyFare.discount !== 'object') {
      throw new Error(
        `Invalid discount object for carType ${dailyFare.carType}`,
      );
    }
    for (const field of requiredDiscountFields) {
      if (
        dailyFare.discount[field] === undefined ||
        dailyFare.discount[field] === null
      ) {
        throw new Error(
          `Missing discount.${field} for carType ${dailyFare.carType}`,
        );
      }
    }

    // Validate nightTime object
    if (!dailyFare.nightTime || typeof dailyFare.nightTime !== 'object') {
      throw new Error(
        `Invalid nightTime object for carType ${dailyFare.carType}`,
      );
    }
    for (const field of requiredNightTimeFields) {
      if (!dailyFare.nightTime[field]) {
        throw new Error(
          `Missing nightTime.${field} for carType ${dailyFare.carType}`,
        );
      }
    }

    // Validate numeric fields are numbers and positive
    const numericFields = [
      'rideSetupFee',
      'baseFare',
      'perMinuteFare',
      'perKmFare',
      'nightCharge',
      'waiting.seconds',
      'waiting.charge',
      'discount.minutes',
      'discount.distance',
      'discount.charge',
    ];

    for (const fieldPath of numericFields) {
      const value = getNestedValue(dailyFare, fieldPath);
      if (typeof value !== 'number' || value < 0) {
        throw new Error(
          `Field ${fieldPath} must be a positive number for carType ${dailyFare.carType}. Got: ${value}`,
        );
      }
    }

    // Validate time format for nightTime
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(dailyFare.nightTime.from)) {
      throw new Error(
        `Invalid nightTime.from format for carType ${dailyFare.carType}. Must be HH:MM format`,
      );
    }
    if (!timeRegex.test(dailyFare.nightTime.to)) {
      throw new Error(
        `Invalid nightTime.to format for carType ${dailyFare.carType}. Must be HH:MM format`,
      );
    }

    // Validate surge array if provided
    if (dailyFare.surge && Array.isArray(dailyFare.surge)) {
      for (const surgeLevel of dailyFare.surge) {
        if (surgeLevel.level === undefined || surgeLevel.level === null) {
          throw new Error(
            `Surge level requires 'level' field for carType ${dailyFare.carType}`,
          );
        }
        if (!surgeLevel.ratio) {
          throw new Error(
            `Surge level requires 'ratio' field for carType ${dailyFare.carType}`,
          );
        }
        if (
          surgeLevel.multiplier === undefined ||
          surgeLevel.multiplier === null
        ) {
          throw new Error(
            `Surge level requires 'multiplier' field for carType ${dailyFare.carType}`,
          );
        }
        if (
          typeof surgeLevel.multiplier !== 'number' ||
          surgeLevel.multiplier < 0
        ) {
          throw new Error(
            `Surge multiplier must be a positive number for carType ${dailyFare.carType}`,
          );
        }
      }
    }
  }

  // Check if default fare already exists for the same regions
  if (payload.applicableRegions && payload.applicableRegions.length > 0) {
    const existingDefault = await FareManagement.findOne({
      isDefault: true,
      applicableRegions: { $in: payload.applicableRegions },
    });

    if (existingDefault) {
      throw new Error(
        `Default fare configuration already exists for regions: ${payload.applicableRegions.join(', ')}`,
      );
    }
  } else {
    // Check if global default already exists
    const existingGlobalDefault = await FareManagement.findOne({
      isDefault: true,
      applicableRegions: { $size: 0 }, // Empty array means global
    });

    if (existingGlobalDefault) {
      throw new Error('Global default fare configuration already exists');
    }
  }

  const defaultFare = await FareManagement.create({
    ...payload,
    isDefault: true,
    zone: null, // Explicitly set zone to null for default fares
  });

  return defaultFare;
};

export const getDefaultFareConfigurations = async () => {
  const defaultFares = await FareManagement.find({
    isDefault: true,
  });

  if (!defaultFares) {
    throw new Error('No Default fare configurations found');
  }

  return defaultFares;
};

export const updateDefaultFareConfiguration = async (updates) => {
  // Validate input exists
  if (!updates || typeof updates !== 'object') {
    throw new Error('Updates object is required');
  }

  if (!updates.carType) {
    throw new Error('carType is required for updating default fare');
  }

  // Validate carType is a string
  if (typeof updates.carType !== 'string') {
    throw new Error('carType must be a string');
  }

  // Validate carType is from allowed enum values
  if (!CAR_TYPES.includes(updates.carType)) {
    throw new Error(`Invalid carType. Must be one of: ${CAR_TYPES.join(', ')}`);
  }

  // Find the default fare
  const defaultFare = await FareManagement.findOne({
    isDefault: true,
  });

  if (!defaultFare) {
    throw new Error('No default fare configuration found');
  }

  const { carType, ...updateData } = updates;

  // Validate that updateData is not empty
  if (Object.keys(updateData).length === 0) {
    throw new Error('No update fields provided');
  }

  // Find the index of the carType in dailyFares array
  const carTypeIndex = defaultFare.dailyFares.findIndex(
    (fare) => fare.carType === carType,
  );

  if (carTypeIndex === -1) {
    throw new Error(
      `Car type '${carType}' not found in default fare configuration`,
    );
  }

  // Validate update fields against schema
  const allowedFields = [
    'rideSetupFee',
    'baseFare',
    'perMinuteFare',
    'perKmFare',
    'waiting',
    'discount',
    'nightTime',
    'nightCharge',
    'surge',
  ];

  const invalidFields = Object.keys(updateData).filter(
    (field) => !allowedFields.includes(field),
  );

  if (invalidFields.length > 0) {
    throw new Error(
      `Invalid fields: ${invalidFields.join(', ')}. Allowed fields: ${allowedFields.join(', ')}`,
    );
  }

  // Type validations for numeric fields
  const numericFields = [
    'rideSetupFee',
    'baseFare',
    'perMinuteFare',
    'perKmFare',
    'nightCharge',
  ];
  for (const field of numericFields) {
    if (
      updateData[field] !== undefined &&
      typeof updateData[field] !== 'number'
    ) {
      throw new Error(`${field} must be a number`);
    }
    if (updateData[field] !== undefined && updateData[field] < 0) {
      throw new Error(`${field} cannot be negative`);
    }
  }

  // Validate waiting object structure if provided
  if (updateData.waiting) {
    if (typeof updateData.waiting !== 'object') {
      throw new Error('waiting must be an object');
    }
    if (
      updateData.waiting.seconds !== undefined &&
      (typeof updateData.waiting.seconds !== 'number' ||
        updateData.waiting.seconds < 0)
    ) {
      throw new Error('waiting.seconds must be a non-negative number');
    }
    if (
      updateData.waiting.charge !== undefined &&
      (typeof updateData.waiting.charge !== 'number' ||
        updateData.waiting.charge < 0)
    ) {
      throw new Error('waiting.charge must be a non-negative number');
    }
  }

  // Validate discount object structure if provided
  if (updateData.discount) {
    if (typeof updateData.discount !== 'object') {
      throw new Error('discount must be an object');
    }
    if (
      updateData.discount.minutes !== undefined &&
      (typeof updateData.discount.minutes !== 'number' ||
        updateData.discount.minutes < 0)
    ) {
      throw new Error('discount.minutes must be a non-negative number');
    }
    if (
      updateData.discount.distance !== undefined &&
      (typeof updateData.discount.distance !== 'number' ||
        updateData.discount.distance < 0)
    ) {
      throw new Error('discount.distance must be a non-negative number');
    }
    if (
      updateData.discount.charge !== undefined &&
      (typeof updateData.discount.charge !== 'number' ||
        updateData.discount.charge < 0)
    ) {
      throw new Error('discount.charge must be a non-negative number');
    }
  }

  // Validate nightTime object structure if provided
  if (updateData.nightTime) {
    if (typeof updateData.nightTime !== 'object') {
      throw new Error('nightTime must be an object');
    }
    if (
      updateData.nightTime.from !== undefined &&
      typeof updateData.nightTime.from !== 'string'
    ) {
      throw new Error('nightTime.from must be a string');
    }
    if (
      updateData.nightTime.to !== undefined &&
      typeof updateData.nightTime.to !== 'string'
    ) {
      throw new Error('nightTime.to must be a string');
    }
  }

  // Validate surge array if provided
  if (updateData.surge) {
    if (!Array.isArray(updateData.surge)) {
      throw new Error('surge must be an array');
    }
    for (const surgeItem of updateData.surge) {
      if (typeof surgeItem !== 'object') {
        throw new Error('Each surge item must be an object');
      }
      if (
        surgeItem.level !== undefined &&
        typeof surgeItem.level !== 'number'
      ) {
        throw new Error('surge.level must be a number');
      }
      if (
        surgeItem.ratio !== undefined &&
        typeof surgeItem.ratio !== 'string'
      ) {
        throw new Error('surge.ratio must be a string');
      }
      if (
        surgeItem.multiplier !== undefined &&
        (typeof surgeItem.multiplier !== 'number' || surgeItem.multiplier < 0)
      ) {
        throw new Error('surge.multiplier must be a non-negative number');
      }
    }
  }

  // Create updated fare object
  const updatedFareObject = {
    ...defaultFare.dailyFares[carTypeIndex].toObject(),
    ...updateData,
  };

  // Update the specific carType fare
  defaultFare.dailyFares[carTypeIndex] = updatedFareObject;

  // Save the updated document - this will trigger mongoose schema validations
  const updatedFare = await defaultFare.save();
  return updatedFare;
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

export const getCarTypes = () => {
  return CAR_TYPES;
};
