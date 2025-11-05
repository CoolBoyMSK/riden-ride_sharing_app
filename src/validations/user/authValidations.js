import Joi from 'joi';
import { GENDER_TYPES } from '../../enums/genderEnums.js';

// --- Signup ---
export const validateDriverSignup = (data) => {
  const schema = Joi.object({
    name: Joi.string().trim().min(3).max(50).required().messages({
      'string.empty': 'Name is required',
      'string.min': 'Name must be at least 3 characters long',
      'any.required': 'Name is required',
    }),

    email: Joi.string().trim().email().required().messages({
      'string.empty': 'Email is required',
      'string.email': 'Email must be a valid email address',
    }),

    gender: Joi.string()
      .valid(...GENDER_TYPES)
      .required()
      .messages({
        'any.only': 'Gender must be male, female, or other',
        'any.required': 'Gender is required',
      }),

    password: Joi.string()
      .min(8)
      .max(128)
      .pattern(/^(?=.*[A-Z])(?=.*[a-z])(?=.*\d).*$/)
      .required()
      .messages({
        'string.empty': 'Password is required',
        'string.min': 'Password must be at least 8 characters long',
        'string.pattern.base':
          'Password must include uppercase, lowercase, and a number',
      }),

    confirmPassword: Joi.any().valid(Joi.ref('password')).required().messages({
      'any.only': 'Passwords must match',
      'any.required': 'Confirm Password is required',
    }),
  });

  return schema.validate(data, { abortEarly: false });
};

export const validateDriverPhoneSignup = (data) => {
  const schema = Joi.object({
    name: Joi.string().trim().min(3).max(50).required().messages({
      'string.empty': 'Name is required',
      'string.min': 'Name must be at least 3 characters long',
      'any.required': 'Name is required',
    }),

    phoneNumber: Joi.string()
      .pattern(/^\+?[0-9]{7,15}$/)
      .required()
      .messages({
        'string.empty': 'Phone number is required',
        'string.pattern.base':
          'Phone number must be valid (7–15 digits, optional +)',
        'any.required': 'Phone number is required',
      }),

    gender: Joi.string()
      .valid(...GENDER_TYPES)
      .required()
      .messages({
        'any.only': 'Gender must be male, female, or other',
        'any.required': 'Gender is required',
      }),

    password: Joi.string()
      .min(8)
      .max(128)
      .pattern(/^(?=.*[A-Z])(?=.*[a-z])(?=.*\d).*$/)
      .required()
      .messages({
        'string.empty': 'Password is required',
        'string.min': 'Password must be at least 8 characters long',
        'string.pattern.base':
          'Password must include uppercase, lowercase, and a number',
      }),

    confirmPassword: Joi.any().valid(Joi.ref('password')).required().messages({
      'any.only': 'Passwords must match',
      'any.required': 'Confirm Password is required',
    }),
  });

  return schema.validate(data, { abortEarly: false });
};

export const validatePassengerSignup = (data) => {
  const schema = Joi.object({
    name: Joi.string().trim().min(3).max(50).required().messages({
      'string.empty': 'Name is required',
      'string.min': 'Name must be at least 3 characters long',
      'any.required': 'Name is required',
    }),

    email: Joi.string().trim().email().required().messages({
      'string.empty': 'Email is required',
      'string.email': 'Email must be a valid email address',
    }),

    gender: Joi.string()
      .valid(...GENDER_TYPES)
      .required()
      .messages({
        'any.only': 'Gender must be male, female, or other',
        'any.required': 'Gender is required',
      }),

    password: Joi.string()
      .min(8)
      .max(128)
      .pattern(/^(?=.*[A-Z])(?=.*[a-z])(?=.*\d).*$/)
      .required()
      .messages({
        'string.empty': 'Password is required',
        'string.min': 'Password must be at least 8 characters long',
        'string.pattern.base':
          'Password must include uppercase, lowercase, and a number',
      }),

    confirmPassword: Joi.any().valid(Joi.ref('password')).required().messages({
      'any.only': 'Passwords must match',
      'any.required': 'Confirm Password is required',
    }),
  });

  return schema.validate(data, { abortEarly: false });
};

export const validatePassengerPhoneSignup = (data) => {
  const schema = Joi.object({
    name: Joi.string().trim().min(3).max(50).required().messages({
      'string.empty': 'Name is required',
      'string.min': 'Name must be at least 3 characters long',
      'any.required': 'Name is required',
    }),

    phoneNumber: Joi.string()
      .pattern(/^\+?[0-9]{7,15}$/)
      .required()
      .messages({
        'string.empty': 'Phone number is required',
        'string.pattern.base':
          'Phone number must be valid (7–15 digits, optional +)',
        'any.required': 'Phone number is required',
      }),

    gender: Joi.string()
      .valid(...GENDER_TYPES)
      .required()
      .messages({
        'any.only': 'Gender must be male, female, or other',
        'any.required': 'Gender is required',
      }),

    password: Joi.string()
      .min(8)
      .max(128)
      .pattern(/^(?=.*[A-Z])(?=.*[a-z])(?=.*\d).*$/)
      .required()
      .messages({
        'string.empty': 'Password is required',
        'string.min': 'Password must be at least 8 characters long',
        'string.pattern.base':
          'Password must include uppercase, lowercase, and a number',
      }),

    confirmPassword: Joi.any().valid(Joi.ref('password')).required().messages({
      'any.only': 'Passwords must match',
      'any.required': 'Confirm Password is required',
    }),
  });

  return schema.validate(data, { abortEarly: false });
};

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
export const loginSchema = Joi.object({
  // 🧩 Login credentials
  email: Joi.string().email().optional(),
  phoneNumber: Joi.string()
    .pattern(/^[0-9+\- ]{7,20}$/)
    .optional(),
  password: Joi.string().min(8).max(128).optional(),
  role: Joi.string().valid('passenger', 'driver').required(),

  // 🔔 Notification fields (mandatory for React Native apps)
  userDeviceType: Joi.string().valid('android', 'ios').required().messages({
    'any.only': 'Device type must be one of android or ios',
    'any.required': 'Device type is required for login',
  }),

  // 📱 Device info (optional but recommended for analytics and security)
  deviceId: Joi.string().trim().min(5).max(200).required().messages({
    'any.required': 'Device ID is required',
    'string.empty': 'Device ID cannot be empty',
  }),
  deviceModel: Joi.string().trim().max(200).optional(),
  deviceVendor: Joi.string().trim().max(100).optional(),
  os: Joi.string().trim().max(100).optional(),
}).custom((value, helpers) => {
  // 🧠 Passenger flow: requires email/phone + password
  if (value.role === 'passenger') {
    if ((!value.email && !value.phoneNumber) || !value.password) {
      return helpers.error('any.invalid', {
        message: 'Passenger login requires email/phone and password',
      });
    }
  }

  // 🧠 Driver flow: requires email or phone only (password optional)
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

export const fcmTokenSchema = Joi.object({
  userDeviceToken: Joi.string().trim().min(10).max(500).required().messages({
    'any.required': 'Device token is required for login',
    'string.empty': 'Device token cannot be empty',
  }),
});

export const validateFCMToken = (payload) =>
  fcmTokenSchema.validateAsync(payload, { abortEarly: false });

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
