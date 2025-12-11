import twilio from 'twilio';
import env from '../../config/envConfig.js';

const client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);

export const name = 'sendPhoneOtp';

export const handler = async (data) => {
  try {
    const { phoneNumber, otp, username, type } = data;
    console.log(`\n📲 ========================================`);
    console.log(`📲 SMS OTP REQUEST`);
    console.log(`📲 ========================================`);
    console.log(`📲 Phone Number: ${phoneNumber}`);
    console.log(`📲 OTP Code: ${otp}`);
    console.log(`📲 Username: ${username || 'N/A'}`);
    console.log(`📲 Type: ${type || 'N/A'}`);
    console.log(`📲 ========================================\n`);

    let message = '';

    if (type === 'update') {
      message = `Hello ${username || ''}, your verification code for updating your phone number is ${otp}. It will expire in 5 minutes.`;
    } else {
      message = `Hello ${username || ''}, your phone number verification code is ${otp}. It will expire in 5 minutes.`;
    }

    console.log(`📲 SMS Message: ${message}`);

    const success = await client.messages.create({
      body: message,
      from: env.TWILIO_PHONE_NUMBER,
      to: phoneNumber,
    });

    console.log(`📲 Twilio Response:`, JSON.stringify(success, null, 2));
    console.log(`✅ OTP SMS sent successfully to ${phoneNumber}\n`);
  } catch (error) {
    console.error(`\n❌ ========================================`);
    console.error(`❌ SMS SEND FAILED`);
    console.error(`❌ ========================================`);
    console.error(`❌ Phone Number: ${data.phoneNumber}`);
    console.error(`❌ OTP Code: ${data.otp}`);
    console.error(`❌ Error: ${error.message}`);
    console.error(`❌ ========================================\n`);
    throw error; // Important: re-throw to mark job as failed
  }
};
