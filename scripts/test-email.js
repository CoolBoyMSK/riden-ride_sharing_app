import sendEmail from '../src/utils/email.js';
import env from '../src/config/envConfig.js';

// Simple local test script to verify SMTP credentials
// Usage:
//   NODE_ENV=development node scripts/test-email.js
//
// Make sure .env.development has valid:
//   EMAIL_USER, EMAIL_PASS, EMAIL_FROM

const run = async () => {
  const to = process.argv[2] || env.EMAIL_FROM;

  console.log('🚀 Sending test email with current SMTP settings...');
  console.log('From:', env.EMAIL_FROM);
  console.log('To  :', to);

  try {
    await sendEmail({
      to,
      subject: 'Riden local SMTP test',
      html: '<p>If you see this, local SMTP is working ✅</p>',
    });
    console.log('✅ Test email send call finished (check your inbox).');
  } catch (err) {
    console.error('❌ Test email failed:', err?.message || err);
    process.exit(1);
  }
};

run();




