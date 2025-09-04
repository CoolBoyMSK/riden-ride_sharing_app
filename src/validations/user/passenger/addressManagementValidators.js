import {
  addAddressSchema,
  updateAddressSchema,
  deleteAddressSchema,
} from '../../../schemas/User/Passenger/addressManagementSchema.js';

// Wrapper to integrate with handleResponse
export const validateAddAddress = async (body) => {
  const { error } = addAddressSchema.validate(body, {
    abortEarly: false,
    allowUnknown: false,
    stripUnknown: true,
  });

  if (error) throw error; // let handleResponse catch it
};

export const validateUpdateAddress = async (body) => {
  const { error } = updateAddressSchema.validate(body, {
    abortEarly: false,
    allowUnknown: false,
    stripUnknown: true,
  });

  if (error) throw error;
};

export const validateDeleteAddress = async (body) => {
  const { error } = deleteAddressSchema.validate(body, {
    abortEarly: false,
    allowUnknown: false,
    stripUnknown: true,
  });

  if (error) throw error;
};
