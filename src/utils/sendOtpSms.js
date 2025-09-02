import { getTwilioClient, TWILIO_CONFIG } from '../config/twilioConfig.js';

export default sendOtpSms = async (receiver, otp) => {
  try {
    const client = getTwilioClient();

    const message = await client.messages.create({
      body: `Your Otp code is ${otp}, you can use it. Please do not share it with anyone.`,
      from: TWILIO_CONFIG.phoneNumber,
      to: receiver,
    });

    return message.sid;
  } catch (error) {
    console.error('❌ Failed to send OTP SMS:', error.message);
  }
};
