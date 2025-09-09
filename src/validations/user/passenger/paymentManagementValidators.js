import {
  addPaymentMethodSchema,
  setDefaultPaymentSchema,
  updatePaymentMethodSchema,
} from '../../../schemas/User/Passenger/paymentManagementSchema.js';

export const validatePaymentMethod = async (body) => {
  const { error } = addPaymentMethodSchema.validate(body, {
    abortEarly: false,
    allowUnknown: false,
    stripUnknown: true,
  });

  if (error) throw error;
};

export const validateSetDefaultPaymentMethod = async (body) => {
  const { error } = setDefaultPaymentSchema.validate(body, {
    abortEarly: false,
    allowUnknown: false,
    stripUnknown: true,
  });

  if (error) throw error;
};

export const validateUpdatePaymentMethodMethod = async (body) => {
  const { error } = updatePaymentMethodSchema.validate(body, {
    abortEarly: false,
    allowUnknown: false,
    stripUnknown: true,
  });

  if (error) throw error;
};
