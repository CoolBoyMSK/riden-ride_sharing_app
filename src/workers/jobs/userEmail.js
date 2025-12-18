import {
  sendEmailVerificationOtp,
  sendEmailUpdateVerificationOtp,
  sendDriverEmailVerificationEmail,
  sendDriverPasswordResetOtpEmail,
  sendPassengerPasswordResetOtpEmail,
} from '../../templates/emails/user/index.js';

export const name = 'sendEmailOtp'; // job name to match when added

export const handler = async (data) => {
  const { email, otp, username, type, role } = data;

  console.log(`\n📧 ========================================`);
  console.log(`📧 PROCESSING EMAIL OTP JOB`);
  console.log(`📧 ========================================`);
  console.log(`📧 Email: ${email}`);
  console.log(`📧 OTP: ${otp}`);
  console.log(`📧 Username: ${username || 'N/A'}`);
  console.log(`📧 Type: ${type || 'N/A'}`);
  console.log(`📧 Role: ${role || 'N/A'}`);
  console.log(`📧 ========================================\n`);

  if (role === 'driver') {
    if (type === 'update') {
      await sendEmailUpdateVerificationOtp(email, otp, username);
    } else if (type === 'password_reset') {
      await sendDriverPasswordResetOtpEmail(email, username, otp);
    } else {
      await sendDriverEmailVerificationEmail(email, otp);
    }
  } else if (role === 'passenger') {
    console.log(`👤 PASSENGER EMAIL OTP - Type: ${type || 'signup/verification'}`);
    if (type === 'update') {
      await sendEmailUpdateVerificationOtp(email, otp, username);
    } else if (type === 'password_reset') {
      await sendPassengerPasswordResetOtpEmail(email, username, otp);
    } else {
      await sendEmailVerificationOtp(email, otp, username);
    }
  }

  console.log(`✅ Email OTP sent successfully to ${email}\n`);
};
