import nodemailer from 'nodemailer';
import env from './envConfig.js';

const emailTransporter = nodemailer.createTransport({
  host: 'email-smtp.us-east-2.amazonaws.com',
  port: 465,
  secure: true,
  auth: {
    user: env.EMAIL_USER,
    pass: env.EMAIL_PASS,
  },
});

export default emailTransporter;
