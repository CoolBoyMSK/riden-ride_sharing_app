import nodemailer from 'nodemailer';
import env from './envConfig.js';

// Validate email configuration
const validateEmailConfig = () => {
  // AWS SES SMTP uses IAM access key IDs (not email format)
  // Just log info for SES setup
  console.log('📧 Using AWS SES SMTP');
  console.log(`📧 Ensure ${env.EMAIL_FROM} is verified in AWS SES`);
  console.log(`📧 SMTP Host: ${env.SMTP_HOST}:${env.SMTP_PORT}`);
  console.log(`📧 Secure: ${env.SMTP_SECURE}\n`);
};

// Validate on module load
validateEmailConfig();

const emailTransporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_SECURE,
  auth: {
    user: env.SES_SMTP_USER,
    pass: env.SES_SMTP_PASS,
  },
});

// Verify connection on startup
emailTransporter.verify((error, success) => {
  if (error) {
    console.error('❌ SMTP Connection Error:', error.message);
    console.error('❌ Check your SMTP_HOST, SMTP_PORT, SES_SMTP_USER, and SES_SMTP_PASS');
  } else {
    console.log('✅ SMTP server connection verified');
    console.log(`📧 SMTP Host: ${env.SMTP_HOST}:${env.SMTP_PORT}`);
    console.log(`📧 From: ${env.EMAIL_FROM}`);
    console.log(`📧 Auth User: ${env.SES_SMTP_USER}`);
  }
});

export default emailTransporter;
