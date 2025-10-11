import twilio from 'twilio';
import env from '../../config/envConfig.js';

const client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);

export const name = 'sendPhoneOtp';

export const handler = async (data) => {
  try {
    const { phoneNumber, otp, username, type } = data;
    console.log(`📲 Sending OTP SMS to ${phoneNumber} (type: ${type})`);

    let message = '';

    if (type === 'update') {
      message = `Hello ${username || ''}, your verification code for updating your phone number is ${otp}. It will expire in 5 minutes.`;
    } else {
      message = `Hello ${username || ''}, your phone number verification code is ${otp}. It will expire in 5 minutes.`;
    }

    const success = await client.messages.create({
      body: message,
      from: env.TWILIO_PHONE_NUMBER,
      to: phoneNumber,
    });

    console.log(`The message response is ${success}`);

    console.log(`✅ OTP SMS sent successfully to ${phoneNumber}`);
  } catch (error) {
    console.error(
      `❌ Failed to send SMS to ${data.phoneNumber}:`,
      error.message,
    );
    throw error; // Important: re-throw to mark job as failed
  }
};
