import Joi from 'joi';
import { GENDER_TYPES } from '../../enums/genderEnums.js';

// --- Signup ---
export const validateSignup = (body) => {
  const schema = Joi.object({
    name: Joi.string().trim().min(2).max(100).required(),
    email: Joi.string().email().required(),
    phoneNumber: Joi.string()
      .pattern(/^\+?[0-9]{7,15}$/)
      .when('type', {
        is: Joi.array()
          .items(Joi.string().valid('passenger', 'driver'))
          .has('passenger'),
        then: Joi.required(),
        otherwise: Joi.optional(),
      }),
    password: Joi.string().min(8).max(128).required(),
    type: Joi.array()
      .items(Joi.string().valid('passenger', 'driver'))
      .optional(),
    gender: Joi.string()
      .valid(...GENDER_TYPES)
      .when('type', {
        is: Joi.array()
          .items(Joi.string().valid('passenger', 'driver'))
          .has('passenger'),
        then: Joi.required(),
        otherwise: Joi.optional(),
      }),
  });

  return schema.validateAsync(body);
};

// --- Login ---
const loginSchema = Joi.object({
  email: Joi.string().email().optional(),
  phoneNumber: Joi.string()
    .pattern(/^[0-9+\- ]{7,20}$/)
    .optional(),
  password: Joi.string().min(8).max(128).optional(),
  role: Joi.string().valid('passenger', 'driver').required(),
}).custom((value, helpers) => {
  // Passenger flow: needs email/phone + password
  if (value.role === 'passenger') {
    if ((!value.email && !value.phoneNumber) || !value.password) {
      return helpers.error('any.invalid', {
        message: 'Passenger login requires email/phone and password',
      });
    }
  }

  // Driver flow: needs email or phone (password optional)
  if (value.role === 'driver') {
    if (!value.email && !value.phoneNumber) {
      return helpers.error('any.invalid', {
        message: 'Driver login requires email or phoneNumber',
      });
    }
  }

  return value;
}, 'role-specific validation');

export const validateLogin = (payload) =>
  loginSchema.validateAsync(payload, { abortEarly: false });

// --- Reset Password ---
// API expects: phoneNumber + newPassword
const resetSchema = Joi.object({
  phoneNumber: Joi.string()
    .pattern(/^\+?[0-9]{7,15}$/)
    .required(),
  newPassword: Joi.string().min(8).max(128).required(),
});

export const validateResetPassword = (body) => resetSchema.validateAsync(body);

// --- Forgot Password ---
// API expects: phoneNumber
const forgotSchema = Joi.object({
  phoneNumber: Joi.string()
    .pattern(/^\+?[0-9]{7,15}$/)
    .required(),
});

export const validateForgotPassword = (body) =>
  forgotSchema.validateAsync(body);

// --- OTP Verification ---
// API expects: role, otp, and either phoneNumber or email
const otpVerifySchema = Joi.object({
  role: Joi.string().valid('driver', 'passenger').required(),
  otp: Joi.string().length(5).required(), // assuming 5-digit OTP
  phoneNumber: Joi.string()
    .pattern(/^\+?[0-9]{7,15}$/)
    .optional(),
  email: Joi.string().email().optional(),
  type: Joi.string()
    .valid('login', 'register', 'reset-password', 'verify-passenger')
    .optional(),
}).xor('phoneNumber', 'email'); // must provide exactly one

export const validateOtpVerify = (body) => otpVerifySchema.validateAsync(body);
