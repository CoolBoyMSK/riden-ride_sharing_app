import {
  sendEmailVerificationOtp,
  sendEmailUpdateVerificationOtp,
  sendDriverEmailVerificationEmail,
  sendDriverPasswordResetOtpEmail,
} from '../../templates/emails/user/index.js';

export const name = 'sendEmailOtp'; // job name to match when added

export const handler = async (data) => {
  const { email, otp, username, type, role } = data;

  console.log(`Processing email job for ${email}`);

  if (role === 'driver') {
    if (type === 'update') {
      await sendEmailUpdateVerificationOtp(email, otp, username);
    } else if (type === 'password_reset') {
      await sendDriverPasswordResetOtpEmail(email, otp);
    } else {
      await sendDriverEmailVerificationEmail(email, otp);
    }
  } else if (role === 'passenger') {
    if (type === 'update') {
      await sendEmailUpdateVerificationOtp(email, otp, username);
    } else {
      await sendEmailVerificationOtp(email, otp, username);
    }
  }

  console.log(`Email OTP sent to ${email}`);
};
