import nodemailer from 'nodemailer';
import env from './envConfig.js';

const emailTransporter = nodemailer.createTransport({
  // service: 'mail.ridentech.ca',
  service: 'gmail',
  // port: 465,
  auth: {
    user: env.EMAIL_USER,
    pass: env.EMAIL_PASS,
  },
});

export default emailTransporter;
