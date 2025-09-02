import twilio from 'twilio';
import env from './envConfig.js';

const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER } = env;

if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
  throw new Error('❌ Missing Twilio configuration in environment variables');
}

let twilioClient;

export const getTwilioClient = () => {
  if (!twilioClient) {
    twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, {
      lazyLoading: true,
    });
  }
  return twilioClient;
};

export const TWILIO_CONFIG = {
  phoneNumber: TWILIO_PHONE_NUMBER,
};
