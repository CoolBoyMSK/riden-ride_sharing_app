import {
  sendEmailVerificationOtp,
  sendEmailUpdateVerificationOtp,
} from '../../templates/emails/user/index.js';

export const name = 'sendEmailOtp'; // job name to match when added

export const handler = async (data) => {
  const { email, otp, username, type } = data;

  console.log(`Processing email job for ${email}`);

  if (type === 'update') {
    await sendEmailUpdateVerificationOtp(email, otp, username);
  } else {
    await sendEmailVerificationOtp(email, otp, username);
  }

  console.log(`Email OTP sent to ${email}`);
};
